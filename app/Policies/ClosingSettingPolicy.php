<?php

namespace App\Policies;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\User;

class ClosingSettingPolicy extends BranchSchedulePolicy
{
    public function manageAny(User $user): bool
    {
        return $user->is_active && parent::manageAny($user)
            && ($user->isSuperAdmin() || $user->hasPermission(PermissionKey::ManageBoxPeriods));
    }

    public function manage(User $user, ?Branch $branch = null): bool
    {
        return $this->manageAny($user) && parent::manage($user, $branch);
    }
}
