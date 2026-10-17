<?php

namespace App\Support;

use App\Models\AuditNote;
use App\Models\AuditNoteReply;
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
 * entries of its open boxes), and as the audit sees them: which branch the
 * actor looks at, and its boxes in each place with what the actor may do
 * to them.
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

    /** What a box needs besides its entries for the boxes pages: who closed, sent and audited it, and the audit's notes with their answers. */
    public const PEOPLE_AND_NOTES = ['receivedBy:id,name', 'sentBy:id,name', 'auditedBy:id,name', 'auditNotes.replies.user:id,name'];

    /**
     * The branch's boxes in one place (see `PLACES`), newest first: those
     * still open or waiting on the branch to confirm them closed, those it
     * confirmed closed and has not sent to audit, or those it sent, with
     * where each stands in audit. `$alsoBoxId` adds one box asked for by a
     * link, wherever it is. Each comes with its entries, when it was opened,
     * closed and sent and by whom, the audit's notes on it, and what the
     * actor may do to it.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function rows(int $branchId, User $actor, string $place, ?int $alsoBoxId = null): Collection
    {
        $boxes = $this->in($branchId, $place)->with([...BranchClosingWorkflow::BOX_DETAILS, ...self::PEOPLE_AND_NOTES])->get();
        if ($alsoBoxId && ! $boxes->contains('id', $alsoBoxId)) {
            $boxes->push(...CashBox::query()->where('branch_id', $branchId)->whereKey($alsoBoxId)->with([...BranchClosingWorkflow::BOX_DETAILS, ...self::PEOPLE_AND_NOTES])->get());
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
     * A box as the boxes pages show it: its entries as the subscriber's
     * statement shows them, where it is (`place`), when it was opened,
     * closed and sent and by whom, where it stands in audit, any debt the
     * audit charged to the branch for it, and the audit's notes on it.
     *
     * @param  array<int, array<string, mixed>>  $ledgers
     * @return array<string, mixed>
     */
    public function present(CashBox $box, array $ledgers = []): array
    {
        $box->user?->makeHidden('permissions');
        $row = $box->toArray();
        unset($row['received_by'], $row['sent_by'], $row['audited_by'], $row['audit_notes']);

        return [
            ...$row,
            'place' => $this->placeOf($box),
            'stage' => $box->stage(),
            'payments' => array_map(fn (array $entry): array => $this->presentEntry($entry, $ledgers), $row['payments'] ?? []),
            'closedAt' => $box->status === 'received' ? ($box->received_at ?? $box->closed_at) : $box->closed_at,
            'closedBy' => $box->receivedBy?->name,
            'sentBy' => $box->sentBy?->name,
            'auditedBy' => $box->auditedBy?->name,
            'notes' => $box->auditNotes->sortBy('id')->map(fn (AuditNote $note): array => [
                'id' => $note->id, 'entryId' => $note->cash_box_payment_id, 'body' => $note->body, 'status' => $note->status, 'createdAt' => $note->created_at,
                'replies' => $note->replies->map(fn (AuditNoteReply $reply): array => ['id' => $reply->id, 'body' => $reply->body, 'user' => $reply->user?->name, 'createdAt' => $reply->created_at])->values()->all(),
            ])->values()->all(),
        ];
    }

    /**
     * How many of the branch's boxes are in each place, for the tabs: the
     * sent ones still in audit, not those it approved.
     *
     * @return array<string, int>
     */
    public function counts(int $branchId): array
    {
        return collect(self::PLACES)->mapWithKeys(fn (string $place): array => [$place => $place === 'sent'
            ? CashBox::query()->where('branch_id', $branchId)->whereNotNull('sent_at')->where('audit_status', '!=', 'approved')->count()
            : $this->in($branchId, $place)->count()])->all();
    }

    /** How many of the branch's sent boxes the audit sent back with a note, waiting on the branch's answer. */
    public function returnedCount(int $branchId): int
    {
        return CashBox::query()->where('branch_id', $branchId)->where('audit_status', 'returned')->count();
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
