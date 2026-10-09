<?php

namespace App\Models;

use Database\Factories\FinancialAuditLineFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Validation\ValidationException;

#[Fillable(['financial_audit_statement_id', 'subscription_transaction_id', 'details', 'status', 'review_notes', 'response', 'correction_transaction_id', 'reviewed_by', 'reviewed_at'])]
class FinancialAuditLine extends Model
{
    /** @use HasFactory<FinancialAuditLineFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return ['details' => 'array', 'reviewed_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::creating(function (self $line): void {
            $detail = collect($line->statement?->snapshot['report']['lines'] ?? [])->firstWhere('transactionId', $line->subscription_transaction_id);
            if ($line->statement?->status === 'audited' || $detail === null || $detail != $line->details) {
                throw ValidationException::withMessages(['audit' => 'الحركة غير موجودة في نسخة الكشف المرسلة.']);
            }
        });
        static::updating(function (self $line): void {
            if ($line->statement->status === 'audited' || $line->isDirty(['financial_audit_statement_id', 'subscription_transaction_id', 'details'])) {
                throw ValidationException::withMessages(['audit' => 'أرقام حركة التدقيق ثابتة ولا يمكن تعديلها.']);
            }
        });
        static::deleting(function (): never {
            throw ValidationException::withMessages(['audit' => 'لا يمكن حذف حركة من كشف التدقيق.']);
        });
    }

    public function statement(): BelongsTo
    {
        return $this->belongsTo(FinancialAuditStatement::class, 'financial_audit_statement_id');
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function correction(): BelongsTo
    {
        return $this->belongsTo(SubscriptionTransaction::class, 'correction_transaction_id');
    }
}
