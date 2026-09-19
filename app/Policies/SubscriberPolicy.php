<?php

namespace App\Policies;

use App\Enums\PermissionKey;
use App\Models\Subscriber;
use App\Models\User;

class SubscriberPolicy
{
    /**
     * Determine whether the user can view any models.
     */
    public function viewAny(User $user): bool
    {
        return $user->isSuperAdmin()
            || $user->isBranchAdmin()
            || $user->isDataEntry()
            || $user->hasPermission(PermissionKey::ManageSubscribers);
    }

    /**
     * Determine whether the user can view the model.
     */
    public function view(User $user, Subscriber $subscriber): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        return ($user->isBranchAdmin() || $user->isDataEntry() || $user->hasPermission(PermissionKey::ManageSubscribers))
            && $subscriber->branch_id === $user->branch_id;
    }

    /**
     * Determine whether the user can create models.
     */
    public function create(User $user): bool
    {
        return $user->isSuperAdmin()
            || $user->isBranchAdmin()
            || $user->isDataEntry()
            || $user->hasPermission(PermissionKey::ManageSubscribers);
    }

    /**
     * Determine whether the user can update the model.
     */
    public function update(User $user, Subscriber $subscriber): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        return ($user->isBranchAdmin() || $user->isDataEntry() || $user->hasPermission(PermissionKey::ManageSubscribers))
            && $subscriber->branch_id === $user->branch_id;
    }

    /**
     * Determine whether the user can delete the model.
     */
    public function delete(User $user, Subscriber $subscriber): bool
    {
        return false;
    }

    /**
     * Determine whether the user can restore the model.
     */
    public function restore(User $user, Subscriber $subscriber): bool
    {
        return false;
    }

    /**
     * Determine whether the user can permanently delete the model.
     */
    public function forceDelete(User $user, Subscriber $subscriber): bool
    {
        return false;
    }
}
