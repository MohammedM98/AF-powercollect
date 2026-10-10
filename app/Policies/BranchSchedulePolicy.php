<?php

namespace App\Policies;

use App\Models\Branch;
use App\Models\User;

/**
 * Who may set a schedule a branch can have its own of (closing, reading): the
 * Super Admin for every branch and for the company's default, and a Branch
 * Admin for their own branch only.
 */
abstract class BranchSchedulePolicy
{
    /**
     * Whether the user sets some schedule at all: the company's or a branch's.
     */
    public function manageAny(User $user): bool
    {
        return $user->isSuperAdmin() || ($user->isBranchAdmin() && $user->branch_id !== null);
    }

    /**
     * Whether the user sets the branch's schedule, or the company's default
     * when no branch is given.
     */
    public function manage(User $user, ?Branch $branch = null): bool
    {
        return $user->isSuperAdmin()
            || ($branch !== null && $user->isBranchAdmin() && $user->branch_id === $branch->id);
    }
}
