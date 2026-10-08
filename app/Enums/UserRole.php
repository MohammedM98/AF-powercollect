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
                PermissionKey::ViewSubscriptions, PermissionKey::CreateSubscriptions, PermissionKey::UpdateSubscriptions,
                PermissionKey::UpdateSubscriptionMinimumCharge,
                PermissionKey::UpdateSubscriptionKilowattPrice,
                PermissionKey::BulkUpdateSubscriptions,
                PermissionKey::ViewMeterBoxes, PermissionKey::CreateMeterBoxes, PermissionKey::UpdateMeterBoxes,
                PermissionKey::ViewSubAreas, PermissionKey::CreateSubAreas, PermissionKey::UpdateSubAreas,
                PermissionKey::ViewMeterReadings, PermissionKey::RecordMeterReadings, PermissionKey::ApproveMeterReadings,
                PermissionKey::CorrectMeterReadings,
                PermissionKey::ViewCollections, PermissionKey::RecordCollections, PermissionKey::ConfirmCollections,
                PermissionKey::ViewBranchPerformance, PermissionKey::ViewDebtAging, PermissionKey::ViewTransactionAudit,
                PermissionKey::AdjustBalances, PermissionKey::CorrectTransactions, PermissionKey::DeleteTransactions,
                PermissionKey::AmendTransactionDetails, PermissionKey::RefundPayments, PermissionKey::ExportFinancialReports,
                PermissionKey::ViewTariffs,
                PermissionKey::ViewCircuitBreakers,
                PermissionKey::PrepareClosings,
                PermissionKey::ViewOwnClosings,
                PermissionKey::ViewMessages, PermissionKey::SendMessages,
            ],
            self::DataEntry => [
                PermissionKey::ViewSubscriptions, PermissionKey::CreateSubscriptions, PermissionKey::UpdateSubscriptions,
                PermissionKey::ViewMeterReadings, PermissionKey::RecordMeterReadings,
                PermissionKey::CorrectMeterReadings, PermissionKey::BulkUpdateSubscriptions,
            ],
            self::Accountant => [
                PermissionKey::ViewSubscriptions,
                PermissionKey::ViewMeterReadings, PermissionKey::ApproveMeterReadings,
                PermissionKey::AdjustBalances,
                PermissionKey::PrepareClosings,
                PermissionKey::ViewOwnClosings,
                PermissionKey::ExportFinancialReports,
            ],
            // Takes payments in the field app, and nothing else: the financial log stays with the branch's staff.
            self::Collector => [PermissionKey::RecordCollections],
            // Sees every branch's closings and reports, and reviews closings and receives the cash handed over (which only the company grants).
            self::FinancialAuditor => [PermissionKey::ViewAllClosings, PermissionKey::AuditClosings, PermissionKey::ExportFinancialReports],
            self::SuperAdmin => [],
        };
    }
}
