<?php

namespace App\Policies;

use App\Enums\PermissionKey;
use App\Models\Area;
use App\Models\SubArea;
use App\Models\User;

class SubAreaPolicy
{
    /**
     * Determine whether the user can view any models. A Branch Admin always
     * can: their branch's sub-areas are part of running the branch.
     */
    public function viewAny(User $user): bool
    {
        return $user->isBranchAdmin()
            || $user->hasAnyPermission(PermissionKey::ViewSubAreas, PermissionKey::CreateSubAreas, PermissionKey::UpdateSubAreas);
    }

    /**
     * Determine whether the user can view the model.
     */
    public function view(User $user, SubArea $subArea): bool
    {
        return $this->viewAny($user);
    }

    /**
     * Determine whether the user can create models — anywhere, or inside
     * `$area` when one is given. A Super Admin may add a sub-area anywhere.
     * A Branch Admin, or staff granted the permission, only inside their
     * own branch's area.
     */
    public function create(User $user, ?Area $area = null): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        $branchAreaId = $user->branchAreaId();

        return ($user->isBranchAdmin() || $user->hasPermission(PermissionKey::CreateSubAreas))
            && $branchAreaId !== null
            && ($area === null || $area->id === $branchAreaId);
    }

    /**
     * Determine whether the user can update the model: a Super Admin any
     * sub-area; a Branch Admin, or staff granted the permission, only those
     * in their own branch's area.
     */
    public function update(User $user, SubArea $subArea): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        return ($user->isBranchAdmin() || $user->hasPermission(PermissionKey::UpdateSubAreas))
            && $subArea->area_id !== null
            && (int) $subArea->area_id === $user->branchAreaId();
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
