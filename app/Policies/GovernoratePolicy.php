<?php

namespace App\Policies;

use App\Enums\PermissionKey;
use App\Models\Governorate;
use App\Models\User;

class GovernoratePolicy
{
    /**
     * Determine whether the user can view any models.
     */
    public function viewAny(User $user): bool
    {
        return $user->hasPermission(PermissionKey::ViewGovernorates)
            || $user->hasPermission(PermissionKey::CreateGovernorates)
            || $user->hasPermission(PermissionKey::UpdateGovernorates);
    }

    /**
     * Determine whether the user can view the model.
     */
    public function view(User $user, Governorate $governorate): bool
    {
        return $this->viewAny($user);
    }

    /**
     * Determine whether the user can create models.
     */
    public function create(User $user): bool
    {
        return $user->hasPermission(PermissionKey::CreateGovernorates);
    }

    /**
     * Determine whether the user can update the model.
     */
    public function update(User $user, Governorate $governorate): bool
    {
        return $user->hasPermission(PermissionKey::UpdateGovernorates);
    }

    /**
     * Determine whether the user can delete the model.
     */
    public function delete(User $user, Governorate $governorate): bool
    {
        return false;
    }

    /**
     * Determine whether the user can restore the model.
     */
    public function restore(User $user, Governorate $governorate): bool
    {
        return false;
    }

    /**
     * Determine whether the user can permanently delete the model.
     */
    public function forceDelete(User $user, Governorate $governorate): bool
    {
        return false;
    }
}
