<?php

namespace App\Policies;

use App\Enums\ClosingStatus;
use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\User;

/**
 * Preparing a branch's closings takes "Prepare Closings", for the user's
 * own branch (any branch for the Super Admin). Reviewing them — returning
 * or approving a branch's daily closing, and approving the company's week
 * and month — takes "Audit Closings", which covers every branch. "View All
 * Closings and Reports" opens every branch's closings and the reports, read
 * only — a financial auditor's view.
 */
class ClosingPolicy
{
    public function export(User $user): bool
    {
        return $this->viewAny($user) && $user->hasPermission(PermissionKey::ExportFinancialReports);
    }

    public function viewAny(User $user): bool
    {
        return $user->hasAnyPermission(PermissionKey::ViewOwnClosings, PermissionKey::PrepareClosings, PermissionKey::AuditClosings, PermissionKey::ViewAllClosings);
    }

    /**
     * Whether the user sees every branch's closings rather than their own.
     */
    public function viewAllBranches(User $user): bool
    {
        return $user->hasAnyPermission(PermissionKey::AuditClosings, PermissionKey::ViewAllClosings);
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

    /**
     * Hand the counted cash of an approved closing over to the company.
     */
    public function handOver(User $user, Closing $closing): bool
    {
        return $closing->status === ClosingStatus::Approved && $this->preparesFor($user, $closing);
    }

    /**
     * Approve the company's week or month.
     */
    public function approvePeriod(User $user): bool
    {
        return $user->hasPermission(PermissionKey::AuditClosings);
    }

    private function preparesFor(User $user, Closing $closing): bool
    {
        return $user->hasPermission(PermissionKey::PrepareClosings)
            && ($user->isSuperAdmin() || $closing->branch_id === $user->branch_id);
    }
}
