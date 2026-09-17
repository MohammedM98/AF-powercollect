<?php

namespace App\Policies;

use App\Models\User;

class PermissionPolicy
{
    /**
     * Only Super Admin may grant or revoke permissions — letting a
     * permission holder manage permissions would let them escalate their
     * own or anyone else's access.
     */
    public function manage(User $user): bool
    {
        return $user->isSuperAdmin();
    }
}
