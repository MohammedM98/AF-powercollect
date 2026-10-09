<?php

namespace App\Models;

use Database\Factories\FinancialAuditStatementFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Validation\ValidationException;

#[Fillable(['number', 'branch_id', 'closing_id', 'type', 'period_start', 'period_end', 'starts_at', 'ends_at', 'status', 'snapshot', 'submitted_by', 'submitted_at', 'reviewed_by', 'reviewed_at'])]
class FinancialAuditStatement extends Model
{
    /** @use HasFactory<FinancialAuditStatementFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return ['snapshot' => 'array', 'period_start' => 'date', 'period_end' => 'date', 'starts_at' => 'datetime', 'ends_at' => 'datetime', 'submitted_at' => 'datetime', 'reviewed_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::updating(function (self $statement): void {
            if ($statement->getRawOriginal('status') === 'audited'
                || $statement->isDirty(['number', 'branch_id', 'closing_id', 'type', 'period_start', 'period_end', 'starts_at', 'ends_at', 'snapshot', 'submitted_by', 'submitted_at'])) {
                throw ValidationException::withMessages(['audit' => 'بيانات الكشف المرسل ثابتة ولا يمكن تغييرها.']);
            }
        });
        static::deleting(function (): never {
            throw ValidationException::withMessages(['audit' => 'لا يمكن حذف كشف أُرسل للتدقيق.']);
        });
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(FinancialAuditLine::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(FinancialAuditEvent::class);
    }
}
