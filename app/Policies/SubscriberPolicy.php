<?php

namespace App\Policies;

use App\Enums\PermissionKey;
use App\Models\Subscriber;
use App\Models\User;

class SubscriberPolicy
{
    /**
     * Whether the user's role or grants let them work with subscribers at
     * all, before branch scoping is considered.
     */
    private function hasBaseAccess(User $user): bool
    {
        return $user->isSuperAdmin()
            || $user->isBranchAdmin()
            || $user->isDataEntry()
            || $user->hasPermission(PermissionKey::ViewSubscribers)
            || $user->hasPermission(PermissionKey::CreateSubscribers)
            || $user->hasPermission(PermissionKey::UpdateSubscribers);
    }

    /**
     * Determine whether the user can view any models.
     */
    public function viewAny(User $user): bool
    {
        return $this->hasBaseAccess($user);
    }

    /**
     * Determine whether the user can view the model.
     */
    public function view(User $user, Subscriber $subscriber): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        return $this->hasBaseAccess($user) && $subscriber->branch_id === $user->branch_id;
    }

    /**
     * Determine whether the user can create models.
     */
    public function create(User $user): bool
    {
        return $user->isSuperAdmin()
            || $user->isBranchAdmin()
            || $user->isDataEntry()
            || $user->hasPermission(PermissionKey::CreateSubscribers);
    }

    /**
     * Determine whether the user can update the model.
     */
    public function update(User $user, Subscriber $subscriber): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        $canUpdate = $user->isBranchAdmin() || $user->isDataEntry() || $user->hasPermission(PermissionKey::UpdateSubscribers);

        return $canUpdate && $subscriber->branch_id === $user->branch_id;
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
