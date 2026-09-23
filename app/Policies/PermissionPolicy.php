<?php

namespace App\Policies;

use App\Models\User;

class PermissionPolicy
{
    /**
     * Super Admin may grant or revoke any non-Super-Admin user's
     * permissions. Branch Admin may also manage permissions, but only for
     * their own branch's staff — PermissionController scopes the user list
     * and the update payload accordingly, so a Branch Admin can never reach
     * another branch's users, another Branch Admin, or a Super Admin and
     * escalate access that way.
     */
    public function manage(User $user): bool
    {
        return $user->isSuperAdmin() || $user->isBranchAdmin();
    }
}
