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
    case FinancialAuditor = 'financial_auditor';

    public function label(): string
    {
        return match ($this) {
            self::SuperAdmin => 'Super Admin',
            self::BranchAdmin => 'Branch Admin',
            self::Collector => 'Collector',
            self::DataEntry => 'Data Entry',
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
        return [self::Collector, self::DataEntry, self::FinancialAuditor];
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
}
