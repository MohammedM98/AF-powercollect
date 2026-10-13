<?php

namespace App\Support;

use App\Models\Branch;
use App\Models\CashBox;
use App\Models\Closing;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * The branch's boxes as the people who close them see them, shared by the
 * financial boxes page (its staff boxes tab) and the safe and statements
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
     * The branch's latest weekly closings, newest first.
     *
     * @return EloquentCollection<int, Closing>
     */
    public function closings(int $branchId): EloquentCollection
    {
        return Closing::query()->where('branch_id', $branchId)->whereNotNull('workflow_settings')->withCount(['auditNotes as open_notes_count' => fn ($query) => $query->where('status', '!=', 'closed')])->orderByDesc('coverage_from')->orderBy('id')->limit(60)->get();
    }

    /**
     * The boxes of those closings, and any box still open, waiting to be
     * confirmed or holding entries under review, each with its entries and
     * whether the actor may confirm it closed.
     *
     * @param  array<int, int>  $closingIds
     * @return Collection<int, array<string, mixed>>
     */
    public function rows(int $branchId, User $actor, array $closingIds): Collection
    {
        return CashBox::query()->where('branch_id', $branchId)
            ->where(fn ($query) => $query->whereIn('closing_id', $closingIds)->orWhere('status', '!=', 'received')->orWhereHas('payments', fn ($payments) => $payments->whereIn('status', ['pending', 'missing', 'rejected'])))
            ->with(BranchClosingWorkflow::BOX_DETAILS)->latest('id')->get()
            ->map(function (CashBox $box) use ($actor): array {
                $box->user?->makeHidden('permissions');
                $row = $box->toArray();
                $row['canCount'] = $this->workflow->mayReceive($box, $actor);
                $row['isOwn'] = $box->user_id === $actor->id;
                $row['stage'] = $box->stage();
                $row['payments'] = array_map($this->presentEntry(...), $row['payments']);

                return $row;
            });
    }

    /**
     * A box entry with links to its subscriber's statement and, for a
     * payment, its receipt. Entries of a statement saved before the
     * transaction's type was kept get no receipt link.
     *
     * @param  array<string, mixed>  $entry
     * @return array<string, mixed>
     */
    public function presentEntry(array $entry): array
    {
        $subscriptionId = $entry['transaction']['subscription_id'] ?? null;
        $payment = ($entry['transaction']['type'] ?? null) === SubscriptionTransaction::TYPE_PAYMENT;

        return [
            ...$entry,
            'statement_url' => $subscriptionId ? route('subscriptions.statement', $subscriptionId) : null,
            'receipt_url' => $subscriptionId && $payment ? route('subscriptions.payments.receipt', [$subscriptionId, $entry['transaction']['id']]) : null,
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
