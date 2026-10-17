<?php

namespace App\Support;

use App\Models\Branch;
use App\Models\CashBox;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * The branch's boxes as the people who close and send them see them, on
 * the financial boxes page (its open, closed and sent boxes, and the
 * entries of its open boxes): which branch the actor looks at, and its
 * boxes in each place with what the actor may do to them.
 */
class BranchBoxes
{
    public function __construct(private BranchClosingWorkflow $workflow) {}

    /**
     * The branches the actor may open (every branch for a super admin, else
     * their own) and the one asked for with `?branch_id=`, else the first.
     *
     * @return array{0: EloquentCollection<int, Branch>, 1: Branch}
     */
    public function branch(Request $request, User $actor): array
    {
        $branches = $actor->isSuperAdmin() ? Branch::query()->orderBy('name')->get(['id', 'name']) : Branch::query()->whereKey($actor->branch_id)->get(['id', 'name']);
        $branchId = $actor->isSuperAdmin() ? ($request->integer('branch_id') ?: $branches->first()?->id) : $actor->branch_id;
        $branch = $branches->firstWhere('id', $branchId);
        abort_unless($branch, 404);

        return [$branches, $branch];
    }

    /**
     * The people who had boxes in the branch, by name, to narrow its boxes
     * and entries to one of them.
     *
     * @return EloquentCollection<int, User>
     */
    public function people(int $branchId): EloquentCollection
    {
        return User::query()->whereIn('id', CashBox::query()->where('branch_id', $branchId)->whereNotNull('user_id')->select('user_id'))->orderBy('name')->get(['id', 'name']);
    }

    /** The places the branch's boxes sit in, each on its own tab: open, closed and not sent yet, and sent to audit. */
    public const PLACES = ['open', 'closed', 'sent'];

    /** How many sent boxes the sent tab lists, newest first. */
    private const SENT_SHOWN = 200;

    /** Who closed and sent a box, besides its entries, for the boxes page. */
    private const PEOPLE = ['receivedBy:id,name', 'sentBy:id,name'];

    /**
     * The branch's boxes in one place (see `PLACES`), newest first: those
     * still open or waiting on the branch to confirm them closed, those it
     * confirmed closed and has not sent to audit, or those it sent.
     * `$alsoBoxId` adds one box asked for by a link, wherever it is. Each
     * comes with its entries, when it was opened, closed and sent and by
     * whom, and what the actor may do to it.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function rows(int $branchId, User $actor, string $place, ?int $alsoBoxId = null): Collection
    {
        $boxes = $this->in($branchId, $place)->with([...BranchClosingWorkflow::BOX_DETAILS, ...self::PEOPLE])->get();
        if ($alsoBoxId && ! $boxes->contains('id', $alsoBoxId)) {
            $boxes->push(...CashBox::query()->where('branch_id', $branchId)->whereKey($alsoBoxId)->with([...BranchClosingWorkflow::BOX_DETAILS, ...self::PEOPLE])->get());
        }
        $ledgers = $this->ledgers($boxes->flatMap(fn (CashBox $box) => $box->payments->pluck('subscription_transaction_id'))->all());
        $send = BranchClosingAccess::send($actor, $branchId);

        return $boxes->map(fn (CashBox $box): array => [
            ...$this->present($box, $ledgers),
            'canCount' => $this->workflow->mayReceive($box, $actor),
            'canSend' => $send,
            'isOwn' => $box->user_id === $actor->id,
        ]);
    }

    /**
     * A box as the boxes page shows it: its entries as the subscriber's
     * statement shows them, where it is (`place`), and when it was opened,
     * closed and sent and by whom.
     *
     * @param  array<int, array<string, mixed>>  $ledgers
     * @return array<string, mixed>
     */
    private function present(CashBox $box, array $ledgers = []): array
    {
        $box->user?->makeHidden('permissions');
        $row = $box->toArray();
        unset($row['received_by'], $row['sent_by']);

        return [
            ...$row,
            'place' => $this->placeOf($box),
            'stage' => $box->stage(),
            'payments' => array_map(fn (array $entry): array => $this->presentEntry($entry, $ledgers), $row['payments'] ?? []),
            'closedAt' => $box->status === 'received' ? ($box->received_at ?? $box->closed_at) : $box->closed_at,
            'closedBy' => $box->receivedBy?->name,
            'sentBy' => $box->sentBy?->name,
        ];
    }

    /**
     * How many of the branch's boxes are in each place, for the tabs.
     *
     * @return array<string, int>
     */
    public function counts(int $branchId): array
    {
        return collect(self::PLACES)->mapWithKeys(fn (string $place): array => [$place => $place === 'sent'
            ? CashBox::query()->where('branch_id', $branchId)->whereNotNull('sent_at')->count()
            : $this->in($branchId, $place)->count()])->all();
    }

    private function placeOf(CashBox $box): string
    {
        return match (true) {
            $box->sent_at !== null => 'sent',
            $box->status === 'received' => 'closed',
            default => 'open',
        };
    }

    /**
     * The branch's boxes in one place. An open box shows once it holds an
     * entry; the sent ones are the latest sent.
     *
     * @return Builder<CashBox>
     */
    private function in(int $branchId, string $place): Builder
    {
        $boxes = CashBox::query()->where('branch_id', $branchId);

        return match ($place) {
            'open' => $boxes->whereIn('status', ['open', 'pending'])->whereHas('payments')->latest('id'),
            'closed' => $boxes->where('status', 'received')->whereNull('sent_at')->orderByDesc('received_at')->orderByDesc('id'),
            'sent' => $boxes->whereNotNull('sent_at')->orderByDesc('sent_at')->orderByDesc('id')->limit(self::SENT_SHOWN),
        };
    }

    /**
     * Each of the transactions as the subscriber's statement shows it, by id.
     *
     * @param  array<int, int|null>  $transactionIds
     * @return array<int, array<string, mixed>>
     */
    public function ledgers(array $transactionIds): array
    {
        $ids = array_values(array_unique(array_filter($transactionIds)));

        return $ids === [] ? [] : SubscriptionTransaction::query()->whereIn('id', $ids)->with('recordedBy:id,name')->get()
            ->mapWithKeys(fn (SubscriptionTransaction $transaction): array => [$transaction->id => $transaction->ledgerDetails()])->all();
    }

    /**
     * A box entry with links to its subscriber's statement (opened at the
     * entry's own transaction) and, for a
     * payment or clearing, its voucher, and its transaction as the statement shows it
     * when found among `$ledgers`. Entries of a statement saved before the
     * transaction's type was kept get no receipt link.
     *
     * @param  array<string, mixed>  $entry
     * @param  array<int, array<string, mixed>>  $ledgers
     * @return array<string, mixed>
     */
    public function presentEntry(array $entry, array $ledgers = []): array
    {
        $subscriptionId = $entry['transaction']['subscription_id'] ?? null;
        $vouched = in_array($entry['transaction']['type'] ?? null, [SubscriptionTransaction::TYPE_PAYMENT, SubscriptionTransaction::TYPE_CLEARING], true);

        return [
            ...$entry,
            'statement_url' => $subscriptionId ? route('subscriptions.statement', [$subscriptionId, 'transaction' => $entry['subscription_transaction_id'] ?? null]) : null,
            'receipt_url' => $subscriptionId && $vouched ? route('subscriptions.payments.receipt', [$subscriptionId, $entry['transaction']['id']]) : null,
            'ledger' => $ledgers[$entry['subscription_transaction_id'] ?? null] ?? null,
        ];
    }

    /**
     * What the actor may do in the branch's closing.
     *
     * @return array{manage: bool, receive: bool, send: bool}
     */
    public function access(User $actor, int $branchId): array
    {
        return ['manage' => BranchClosingAccess::manage($actor, $branchId), 'receive' => BranchClosingAccess::receive($actor, $branchId), 'send' => BranchClosingAccess::send($actor, $branchId)];
    }
}
