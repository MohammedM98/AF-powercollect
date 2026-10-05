<?php

namespace App\Policies;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\SubscriberTransaction;
use App\Models\User;

/**
 * Access to the subscribers' account lines as a whole — the financial log
 * and the branch performance pages built on them — and to correcting or
 * deleting one. Lines are written by the subscriber, payment and reading
 * flows, each under its own permission.
 */
class SubscriberTransactionPolicy
{
    /**
     * The financial log takes the "View Collections" permission (the
     * Super Admin holds every permission).
     */
    public function viewAny(User $user): bool
    {
        return $user->hasPermission(PermissionKey::ViewCollections);
    }

    /**
     * The branch performance pages take their own "View Branch
     * Performance" permission.
     */
    public function viewBranchPerformance(User $user): bool
    {
        return $user->hasPermission(PermissionKey::ViewBranchPerformance);
    }

    /**
     * One branch's figures: any branch for the Super Admin, otherwise only
     * the user's own.
     */
    public function viewForBranch(User $user, Branch $branch): bool
    {
        return $this->viewBranchPerformance($user) && ($user->isSuperAdmin() || $branch->id === $user->branch_id);
    }

    /**
     * The debt aging report (أعمار الديون) takes its own permission.
     */
    public function viewDebtAging(User $user): bool
    {
        return $user->hasPermission(PermissionKey::ViewDebtAging);
    }

    /**
     * The audit log (سجل التدقيق) — who changed or deleted which line —
     * takes its own permission.
     */
    public function viewTransactionAudit(User $user): bool
    {
        return $user->hasPermission(PermissionKey::ViewTransactionAudit);
    }

    /**
     * Determine whether the user can view the model.
     */
    public function view(User $user, SubscriberTransaction $subscriberTransaction): bool
    {
        return false;
    }

    /**
     * Determine whether the user can create models.
     */
    public function create(User $user): bool
    {
        return false;
    }

    /**
     * Correcting a line takes the "Edit Transactions" permission, for a
     * subscriber of the user's own branch (any branch for the Super Admin),
     * and only while the line can still be corrected.
     */
    public function update(User $user, SubscriberTransaction $subscriberTransaction): bool
    {
        return $user->hasPermission(PermissionKey::CorrectTransactions) && $this->mayChange($user, $subscriberTransaction);
    }

    /** Amend payment details without changing its financial meaning. */
    public function amend(User $user, SubscriberTransaction $subscriberTransaction): bool
    {
        return $user->hasPermission(PermissionKey::AmendTransactionDetails)
            && $subscriberTransaction->isAmendable()
            && $this->inBranchOf($user, $subscriberTransaction);
    }

    /**
     * Cancellation and refunding require their own permissions. Permanent
     * deletion never implies either, including through the legacy endpoint.
     */
    public function delete(User $user, SubscriberTransaction $subscriberTransaction): bool
    {
        $canDelete = $user->hasPermission($subscriberTransaction->isPayment()
            ? PermissionKey::RefundPayments
            : PermissionKey::DeleteTransactions);

        return $canDelete
            && $subscriberTransaction->isCancellable()
            && $this->inBranchOf($user, $subscriberTransaction);
    }

    private function mayChange(User $user, SubscriberTransaction $subscriberTransaction): bool
    {
        return $subscriberTransaction->isCorrectable() && $this->inBranchOf($user, $subscriberTransaction);
    }

    private function inBranchOf(User $user, SubscriberTransaction $subscriberTransaction): bool
    {
        return $user->isSuperAdmin() || $subscriberTransaction->subscriber->branch_id === $user->branch_id;
    }

    /**
     * Determine whether the user can restore the model.
     */
    public function restore(User $user, SubscriberTransaction $subscriberTransaction): bool
    {
        return false;
    }

    /**
     * Removing a line from the statement, with a retained audit record, takes its own
     * "Permanently Delete Transactions" permission, in the user's own
     * branch. Only the last line of the statement, and not one a closing
     * has counted.
     */
    public function forceDelete(User $user, SubscriberTransaction $subscriberTransaction): bool
    {
        return $user->hasPermission(PermissionKey::ForceDeleteTransactions)
            && $subscriberTransaction->isErasable()
            && $this->inBranchOf($user, $subscriberTransaction);
    }
}
