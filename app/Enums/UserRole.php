<?php

namespace App\Enums;

use App\Enums\Concerns\HasOptions;

enum UserRole: string
{
    use HasOptions;

    case SuperAdmin = 'super_admin';
    case BranchAdmin = 'branch_admin';
    case Collector = 'collector';
    case DataEntry = 'data_entry';
    case Accountant = 'accountant';
    case FinancialAuditor = 'financial_auditor';

    public function label(): string
    {
        return match ($this) {
            self::SuperAdmin => 'Super Admin',
            self::BranchAdmin => 'Branch Admin',
            self::Collector => 'Collector',
            self::DataEntry => 'Data Entry',
            self::Accountant => 'Accountant',
            self::FinancialAuditor => 'Financial Auditor',
        };
    }

    /**
     * The branch-level staff roles a Branch Admin may assign. Excludes
     * BranchAdmin and SuperAdmin, which only a Super Admin may assign.
     *
     * @return array<int, self>
     */
    public static function staffRoles(): array
    {
        return [self::Collector, self::DataEntry, self::Accountant, self::FinancialAuditor];
    }

    /**
     * The roles a Super Admin may assign: every role except Super Admin
     * itself, which is never handed out from the app.
     *
     * @return array<int, self>
     */
    public static function assignableBySuperAdmin(): array
    {
        return [self::BranchAdmin, ...self::staffRoles()];
    }

    /**
     * The permissions ticked for a user of this role when they're added
     * (or given this role): their usual work. After that the ticks are
     * the user's own — a Super Admin, or the Branch Admin for their staff,
     * can add or remove any of them. A Super Admin needs none: they hold
     * every permission.
     *
     * @return array<int, PermissionKey>
     */
    public function starterPermissions(): array
    {
        return match ($this) {
            self::BranchAdmin => [
                PermissionKey::ViewUsers, PermissionKey::CreateUsers, PermissionKey::UpdateUsers,
                PermissionKey::ViewSubscribers, PermissionKey::CreateSubscribers, PermissionKey::UpdateSubscribers,
                PermissionKey::UpdateSubscriberMinimumCharge,
                PermissionKey::ViewMeterBoxes, PermissionKey::CreateMeterBoxes, PermissionKey::UpdateMeterBoxes,
                PermissionKey::ViewSubAreas, PermissionKey::CreateSubAreas, PermissionKey::UpdateSubAreas,
                PermissionKey::ViewMeterReadings, PermissionKey::RecordMeterReadings,
                PermissionKey::ViewCollections, PermissionKey::RecordCollections, PermissionKey::ConfirmCollections,
                PermissionKey::ViewTariffs,
                PermissionKey::ViewCircuitBreakers,
            ],
            self::DataEntry => [
                PermissionKey::ViewSubscribers, PermissionKey::CreateSubscribers, PermissionKey::UpdateSubscribers,
                PermissionKey::ViewMeterReadings, PermissionKey::RecordMeterReadings,
            ],
            self::Accountant => [
                PermissionKey::ViewSubscribers,
                PermissionKey::ViewMeterReadings, PermissionKey::ApproveMeterReadings,
            ],
            self::SuperAdmin, self::Collector, self::FinancialAuditor => [],
        };
    }
}
