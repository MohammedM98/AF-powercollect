<?php

namespace App\Support;

use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Models\ClosingSetting;
use App\Models\User;

class BranchClosingAccess
{
    public static function view(User $user): bool
    {
        return $user->is_active && ($user->isSuperAdmin() || ($user->branch_id && ($user->isBranchAdmin() || $user->hasPermission(PermissionKey::CloseCashBoxes) || $user->hasPermission(PermissionKey::SendCashBoxesToAudit) || in_array($user->id, ClosingSetting::forBranch($user->branch_id)->receivers ?? [], true) || in_array($user->id, ClosingSetting::forBranch($user->branch_id)->approvers ?? [], true))));
    }

    public static function manage(User $user, int $branchId): bool
    {
        return $user->is_active && ($user->isSuperAdmin() || ($user->isBranchAdmin() && $user->branch_id === $branchId));
    }

    /**
     * Whether the user may close, count and receive the branch's boxes: the
     * branch admin and approvers, anyone given the "Close Cash Boxes"
     * permission, and the receivers named in the closing settings.
     */
    public static function receive(User $user, int $branchId): bool
    {
        return self::approve($user, $branchId) || ($user->is_active && $user->branch_id === $branchId
            && ($user->hasPermission(PermissionKey::CloseCashBoxes) || in_array($user->id, ClosingSetting::forBranch($branchId)->receivers ?? [], true)));
    }

    /**
     * Whether the user may send the branch's closed boxes to audit and
     * answer the audit's notes on them: the branch admin, and anyone of the
     * branch given the "Send Cash Boxes to Audit" permission.
     */
    public static function send(User $user, int $branchId): bool
    {
        return self::manage($user, $branchId) || ($user->is_active && $user->branch_id === $branchId && $user->hasPermission(PermissionKey::SendCashBoxesToAudit));
    }

    /** Whether the user audits the boxes every branch sends: the financial auditors, and the Super Admin. */
    public static function audit(User $user): bool
    {
        return $user->is_active && ($user->isSuperAdmin() || $user->role === UserRole::FinancialAuditor);
    }

    public static function approve(User $user, int $branchId): bool
    {
        return self::manage($user, $branchId) || ($user->is_active && $user->branch_id === $branchId && in_array($user->id, ClosingSetting::forBranch($branchId)->approvers ?? [], true));
    }
}
