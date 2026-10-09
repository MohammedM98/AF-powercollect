<?php

namespace App\Policies;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\FinancialAuditStatement;
use App\Models\User;

class FinancialAuditStatementPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasAnyPermission(PermissionKey::AuditClosings, PermissionKey::ViewAllClosings, PermissionKey::MarkClosingsAudited);
    }

    public function viewBranchStatements(User $user): bool
    {
        return $user->hasAnyPermission(PermissionKey::PrepareClosings, PermissionKey::ViewOwnClosings);
    }

    public function view(User $user, FinancialAuditStatement $statement): bool
    {
        return $this->viewAny($user) || ($this->viewBranchStatements($user) && $user->branch_id === $statement->branch_id);
    }

    public function submit(User $user, Branch $branch): bool
    {
        return $user->hasPermission(PermissionKey::PrepareClosings) && ($user->isSuperAdmin() || $user->branch_id === $branch->id);
    }

    public function review(User $user, FinancialAuditStatement $statement): bool
    {
        return $statement->status !== 'audited'
            && $statement->submitted_by !== $user->id
            && $user->hasAnyPermission(PermissionKey::AuditClosings, PermissionKey::MarkClosingsAudited);
    }

    public function respond(User $user, FinancialAuditStatement $statement): bool
    {
        return $statement->status !== 'audited' && $user->hasPermission(PermissionKey::PrepareClosings)
            && ($user->isSuperAdmin() || $user->branch_id === $statement->branch_id);
    }
}
