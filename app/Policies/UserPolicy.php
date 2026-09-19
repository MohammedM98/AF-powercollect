<?php

namespace App\Policies;

use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Models\User;

class UserPolicy
{
    /**
     * Determine whether the user can view any models.
     */
    public function viewAny(User $user): bool
    {
        return $user->isSuperAdmin() || $user->isBranchAdmin() || $user->hasPermission(PermissionKey::ManageUsers);
    }

    /**
     * Determine whether the user can view the model.
     */
    public function view(User $user, User $model): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        return ($user->isBranchAdmin() || $user->hasPermission(PermissionKey::ManageUsers))
            && $model->branch_id === $user->branch_id;
    }

    /**
     * Determine whether the user can create models.
     *
     * Deliberately role-based only (not grantable via a custom permission):
     * creating a user assigns them a role/branch, and both the form and the
     * controller's server-side forcing logic are built around the actor
     * being a Super Admin or Branch Admin specifically.
     */
    public function create(User $user): bool
    {
        return $user->isSuperAdmin() || $user->isBranchAdmin();
    }

    /**
     * Determine whether the user can update the model.
     */
    public function update(User $user, User $model): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        return ($user->isBranchAdmin() || $user->hasPermission(PermissionKey::ManageUsers))
            && in_array($model->role, UserRole::staffRoles(), true)
            && $model->branch_id === $user->branch_id;
    }

    /**
     * Determine whether the user can delete the model.
     */
    public function delete(User $user, User $model): bool
    {
        return false;
    }

    /**
     * Determine whether the user can restore the model.
     */
    public function restore(User $user, User $model): bool
    {
        return false;
    }

    /**
     * Determine whether the user can permanently delete the model.
     */
    public function forceDelete(User $user, User $model): bool
    {
        return false;
    }
}
