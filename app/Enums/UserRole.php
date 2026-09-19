<?php

namespace App\Enums;

enum UserRole: string
{
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
}
