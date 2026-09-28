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
     * One branch's figures: any branch for the Super Admin, otherwise only
     * the user's own.
     */
    public function viewForBranch(User $user, Branch $branch): bool
    {
        return $this->viewAny($user) && ($user->isSuperAdmin() || $branch->id === $user->branch_id);
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

    /**
     * Deleting (cancelling) a line takes the "Delete Transactions"
     * permission, on the same terms as correcting one.
     */
    public function delete(User $user, SubscriberTransaction $subscriberTransaction): bool
    {
        return $user->hasPermission(PermissionKey::DeleteTransactions) && $this->mayChange($user, $subscriberTransaction);
    }

    private function mayChange(User $user, SubscriberTransaction $subscriberTransaction): bool
    {
        return $subscriberTransaction->isCorrectable()
            && ($user->isSuperAdmin() || $subscriberTransaction->subscriber->branch_id === $user->branch_id);
    }

    /**
     * Determine whether the user can restore the model.
     */
    public function restore(User $user, SubscriberTransaction $subscriberTransaction): bool
    {
        return false;
    }

    /**
     * Determine whether the user can permanently delete the model.
     */
    public function forceDelete(User $user, SubscriberTransaction $subscriberTransaction): bool
    {
        return false;
    }
}
