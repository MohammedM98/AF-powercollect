<?php

namespace App\Policies;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\SubscriberTransaction;
use App\Models\User;

/**
 * Read-only access to the subscribers' account lines as a whole — the
 * financial log and the branch performance pages built on them. Lines are
 * written only by the subscriber, payment and reading flows, each under
 * its own permission, never from these pages.
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
     * Determine whether the user can update the model.
     */
    public function update(User $user, SubscriberTransaction $subscriberTransaction): bool
    {
        return false;
    }

    /**
     * Determine whether the user can delete the model.
     */
    public function delete(User $user, SubscriberTransaction $subscriberTransaction): bool
    {
        return false;
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
