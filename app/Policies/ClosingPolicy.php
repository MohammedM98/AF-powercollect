<?php

namespace App\Policies;

use App\Enums\ClosingStatus;
use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\User;
use App\Support\ClosingPeriods;

/**
 * Branch preparation and local approval use "Prepare Closings" for the
 * user's own branch (any branch for the Super Admin), with a different
 * approver. Existing company closing and legacy review permissions remain
 * compatible. Submitted central audit statements use their separate policy.
 */
class ClosingPolicy
{
    public function export(User $user): bool
    {
        return $this->viewAny($user) && $user->hasPermission(PermissionKey::ExportFinancialReports);
    }

    public function viewAny(User $user): bool
    {
        return $user->hasAnyPermission(PermissionKey::ViewOwnClosings, PermissionKey::PrepareClosings, PermissionKey::AuditClosings, PermissionKey::ViewAllClosings, PermissionKey::CloseWeeklyPeriods, PermissionKey::MarkClosingsAudited);
    }

    /**
     * Whether the user sees every branch's closings rather than their own.
     */
    public function viewAllBranches(User $user): bool
    {
        return $user->hasAnyPermission(PermissionKey::AuditClosings, PermissionKey::ViewAllClosings, PermissionKey::CloseWeeklyPeriods, PermissionKey::MarkClosingsAudited);
    }

    /**
     * Whether the user may open this branch's closings.
     */
    public function viewBranch(User $user, Branch $branch): bool
    {
        return $this->viewAllBranches($user)
            || ($user->hasAnyPermission(PermissionKey::ViewOwnClosings, PermissionKey::PrepareClosings) && ($user->isSuperAdmin() || $branch->id === $user->branch_id));
    }

    /**
     * Count the cash, match the transfers and send the closing for review,
     * while the branch can still change it.
     */
    public function prepare(User $user, Closing $closing): bool
    {
        return $closing->status->isEditable() && $this->preparesFor($user, $closing);
    }

    /**
     * Return or approve a closing waiting for review. Approving it also
     * needs someone other than whoever prepared it; the model checks that.
     */
    public function audit(User $user, Closing $closing): bool
    {
        return $closing->status === ClosingStatus::Submitted && $user->hasPermission(PermissionKey::AuditClosings);
    }

    public function approveBranch(User $user, Closing $closing): bool
    {
        return $closing->status === ClosingStatus::Submitted && $closing->prepared_by !== $user->id
            && $this->preparesFor($user, $closing);
    }

    /**
     * Hand the counted cash of an approved closing over to the company,
     * once its day has closed: a day closed by hand early takes no more
     * cash movements before its cut-off.
     */
    public function handOver(User $user, Closing $closing): bool
    {
        return $closing->status === ClosingStatus::Approved
            && ClosingPeriods::hasEnded($closing->period_end)
            && $this->preparesFor($user, $closing);
    }

    /**
     * Approve the company's week or month.
     */
    public function approvePeriod(User $user): bool
    {
        return $user->hasPermission(PermissionKey::AuditClosings);
    }

    public function closeWeek(User $user): bool
    {
        return $user->hasAnyPermission(PermissionKey::AuditClosings, PermissionKey::CloseWeeklyPeriods);
    }

    private function preparesFor(User $user, Closing $closing): bool
    {
        return $user->hasPermission(PermissionKey::PrepareClosings)
            && ($user->isSuperAdmin() || $closing->branch_id === $user->branch_id);
    }
}
