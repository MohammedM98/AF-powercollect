<?php

namespace App\Support;

use App\Models\ClosingSetting;
use App\Models\User;

class BranchClosingAccess
{
    public static function view(User $user): bool
    {
        return $user->is_active && ($user->isSuperAdmin() || ($user->branch_id && ($user->isBranchAdmin() || in_array($user->id, ClosingSetting::forBranch($user->branch_id)->receivers ?? [], true) || in_array($user->id, ClosingSetting::forBranch($user->branch_id)->approvers ?? [], true))));
    }

    public static function manage(User $user, int $branchId): bool
    {
        return $user->is_active && ($user->isSuperAdmin() || ($user->isBranchAdmin() && $user->branch_id === $branchId));
    }

    public static function receive(User $user, int $branchId): bool
    {
        return self::manage($user, $branchId) || ($user->is_active && $user->branch_id === $branchId && in_array($user->id, ClosingSetting::forBranch($branchId)->receivers ?? [], true));
    }

    public static function approve(User $user, int $branchId): bool
    {
        return self::manage($user, $branchId) || ($user->is_active && $user->branch_id === $branchId && in_array($user->id, ClosingSetting::forBranch($branchId)->approvers ?? [], true));
    }
}
