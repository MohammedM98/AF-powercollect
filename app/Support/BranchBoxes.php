<?php

namespace App\Support;

use App\Models\Branch;
use App\Models\CashBox;
use App\Models\Closing;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * The branch's boxes as the people who close them see them, shared by the
 * financial boxes page (its boxes and open entries tabs) and closing management
 * page: which branch the actor looks at, its weekly closings, and every box
 * still in play with what the actor may do to it.
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

    /**
     * The branch's latest weekly closings, newest first.
     *
     * @return EloquentCollection<int, Closing>
     */
    public function closings(int $branchId): EloquentCollection
    {
        return Closing::query()->where('branch_id', $branchId)->whereNotNull('workflow_settings')->withCount(['auditNotes as open_notes_count' => fn ($query) => $query->where('status', '!=', 'closed')])->orderByDesc('coverage_from')->orderBy('id')->limit(60)->get();
    }

    /**
     * The boxes of the week not sent yet: any box still open or waiting to
     * be confirmed, those confirmed into a weekly package not yet sent to
     * the audit, and those holding a transfer or clearing not yet matched,
     * which the next package carries. Once its package is sent, a box is
     * looked over in that package. `$alsoBoxId` adds one box asked for by
     * a link, sent or not. Each comes with its entries and whether the
     * actor may confirm it closed.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function rows(int $branchId, User $actor, ?int $alsoBoxId = null): Collection
    {
        $boxes = $this->inPlay($branchId, $alsoBoxId)->with(BranchClosingWorkflow::BOX_DETAILS)->latest('id')->get();
        $ledgers = $this->ledgers($boxes->flatMap(fn (CashBox $box) => $box->payments->pluck('subscription_transaction_id'))->all());

        return $boxes->map(function (CashBox $box) use ($actor, $ledgers): array {
            $box->user?->makeHidden('permissions');
            $row = $box->toArray();
            $row['canCount'] = $this->workflow->mayReceive($box, $actor);
            $row['isOwn'] = $box->user_id === $actor->id;
            $row['stage'] = $box->stage();
            $row['payments'] = array_map(fn (array $entry): array => $this->presentEntry($entry, $ledgers), $row['payments']);

            return $row;
        });
    }

    /** How many boxes the financial boxes page lists for the branch: those of the week not sent yet. */
    public function count(int $branchId): int
    {
        return $this->inPlay($branchId)->count();
    }

    /**
     * The branch's boxes of the week not sent yet (see `rows`), and the one
     * box asked for by a link.
     *
     * @return Builder<CashBox>
     */
    private function inPlay(int $branchId, ?int $alsoBoxId = null): Builder
    {
        $unsent = fn (Builder $closing) => $closing->whereNull('submitted_snapshot');

        return CashBox::query()->where('branch_id', $branchId)->where(fn (Builder $query) => $query
            ->where('status', '!=', 'received')
            ->orWhereHas('receivedIn', $unsent)
            ->orWhere(fn (Builder $legacy) => $legacy->whereNull('received_in_closing_id')->whereHas('closing', $unsent))
            ->orWhereHas('payments', fn (Builder $payments) => $payments->where('method', '!=', 'cash')->whereIn('status', ['pending', 'missing', 'rejected'])
                ->whereHas('transaction', fn (Builder $transaction) => $transaction->where('status', SubscriptionTransaction::STATUS_ACTIVE)))
            ->when($alsoBoxId, fn (Builder $query) => $query->orWhere('id', $alsoBoxId)));
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
     * A box entry with links to its subscriber's statement and, for a
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
            'statement_url' => $subscriptionId ? route('subscriptions.statement', $subscriptionId) : null,
            'receipt_url' => $subscriptionId && $vouched ? route('subscriptions.payments.receipt', [$subscriptionId, $entry['transaction']['id']]) : null,
            'ledger' => $ledgers[$entry['subscription_transaction_id'] ?? null] ?? null,
        ];
    }

    /**
     * What the actor may do in the branch's closing.
     *
     * @return array{manage: bool, receive: bool, approve: bool}
     */
    public function access(User $actor, int $branchId): array
    {
        return ['manage' => BranchClosingAccess::manage($actor, $branchId), 'receive' => BranchClosingAccess::receive($actor, $branchId), 'approve' => BranchClosingAccess::approve($actor, $branchId)];
    }
}
