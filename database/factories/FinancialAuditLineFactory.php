<?php

namespace Database\Factories;

use App\Models\FinancialAuditLine;
use App\Models\FinancialAuditStatement;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<FinancialAuditLine> */
class FinancialAuditLineFactory extends Factory
{
    public function definition(): array
    {
        return [
            'financial_audit_statement_id' => FinancialAuditStatement::factory()->withPayment(),
            'subscription_transaction_id' => fn (array $attributes): int => FinancialAuditStatement::findOrFail($attributes['financial_audit_statement_id'])->snapshot['report']['lines'][0]['transactionId'],
            'details' => fn (array $attributes): array => FinancialAuditStatement::findOrFail($attributes['financial_audit_statement_id'])->snapshot['report']['lines'][0],
            'status' => 'pending',
        ];
    }
}
