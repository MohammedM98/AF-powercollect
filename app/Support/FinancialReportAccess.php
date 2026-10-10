<?php

namespace App\Support;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class FinancialReportAccess
{
    public static function view(User $user): bool
    {
        return $user->hasAnyPermission(PermissionKey::ViewFinancialReports, PermissionKey::ViewAllFinancialReports)
            || self::hasHistoricalAccess($user, ['closings.view', 'closings.prepare', 'closings.audit', 'closings.view_all']);
    }

    public static function viewAllBranches(User $user): bool
    {
        return $user->hasPermission(PermissionKey::ViewAllFinancialReports)
            || self::hasHistoricalAccess($user, ['closings.audit', 'closings.view_all']);
    }

    public static function export(User $user): bool
    {
        return self::view($user) && $user->hasPermission(PermissionKey::ExportFinancialReports);
    }

    /** @return Collection<int, Branch> */
    public static function branches(User $user): Collection
    {
        return Branch::query()
            ->when(! self::viewAllBranches($user), fn (Builder $query): Builder => $query->whereKey($user->branch_id))
            ->orderBy('name')
            ->get();
    }

    /**
     * Preserve existing report access without changing stored permission grants.
     *
     * @param  array<int, string>  $keys
     */
    private static function hasHistoricalAccess(User $user, array $keys): bool
    {
        return $user->permissions->contains(fn (Permission $permission): bool => in_array($permission->key, $keys, true));
    }
}
