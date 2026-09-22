<?php

namespace App\Policies;

use App\Enums\PermissionKey;
use App\Models\SubArea;
use App\Models\User;

class SubAreaPolicy
{
    /**
     * Determine whether the user can view any models.
     */
    public function viewAny(User $user): bool
    {
        return $user->hasPermission(PermissionKey::ViewSubAreas)
            || $user->hasPermission(PermissionKey::CreateSubAreas)
            || $user->hasPermission(PermissionKey::UpdateSubAreas);
    }

    /**
     * Determine whether the user can view the model.
     */
    public function view(User $user, SubArea $subArea): bool
    {
        return $this->viewAny($user);
    }

    /**
     * Determine whether the user can create models.
     */
    public function create(User $user): bool
    {
        return $user->hasPermission(PermissionKey::CreateSubAreas);
    }

    /**
     * Determine whether the user can update the model.
     */
    public function update(User $user, SubArea $subArea): bool
    {
        return $user->hasPermission(PermissionKey::UpdateSubAreas);
    }

    /**
     * Determine whether the user can delete the model.
     */
    public function delete(User $user, SubArea $subArea): bool
    {
        return false;
    }

    /**
     * Determine whether the user can restore the model.
     */
    public function restore(User $user, SubArea $subArea): bool
    {
        return false;
    }

    /**
     * Determine whether the user can permanently delete the model.
     */
    public function forceDelete(User $user, SubArea $subArea): bool
    {
        return false;
    }
}
