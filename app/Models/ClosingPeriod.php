<?php

namespace App\Models;

use App\Enums\ClosingPeriodStatus;
use Database\Factories\ClosingPeriodFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Validation\ValidationException;

#[Fillable(['number', 'period_start', 'period_end', 'starts_at', 'cutoff_at', 'eligible_at', 'timezone', 'status', 'closing_id', 'prepared_at', 'closed_at', 'closed_by', 'reviewed_at', 'reviewed_by', 'reconciliation', 'audit_notes'])]
class ClosingPeriod extends Model
{
    /** @use HasFactory<ClosingPeriodFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return ['period_start' => 'immutable_date', 'period_end' => 'immutable_date', 'starts_at' => 'immutable_datetime', 'cutoff_at' => 'immutable_datetime', 'eligible_at' => 'immutable_datetime', 'prepared_at' => 'datetime', 'closed_at' => 'datetime', 'reviewed_at' => 'datetime', 'status' => ClosingPeriodStatus::class, 'reconciliation' => 'array'];
    }

    protected static function booted(): void
    {
        static::updating(function (self $period): void {
            $originalStatus = ClosingPeriodStatus::from($period->getRawOriginal('status'));
            if ($originalStatus->isClosed() && $period->isDirty('status')
                && ! (($originalStatus === ClosingPeriodStatus::Closed && $period->status === ClosingPeriodStatus::UnderAudit)
                    || ($originalStatus === ClosingPeriodStatus::UnderAudit && $period->status === ClosingPeriodStatus::Audited))) {
                throw ValidationException::withMessages(['period' => 'لا يمكن إعادة فتح فترة مغلقة.']);
            }
            if ($originalStatus === ClosingPeriodStatus::Audited && $period->isDirty()) {
                throw ValidationException::withMessages(['period' => 'لا يمكن تغيير فترة انتهى تدقيقها.']);
            }
            if (ClosingPeriodStatus::from($period->getRawOriginal('status'))->isClosed()
                && $period->isDirty(['number', 'period_start', 'period_end', 'starts_at', 'cutoff_at', 'eligible_at', 'timezone', 'closing_id', 'closed_at', 'closed_by'])) {
                throw ValidationException::withMessages(['period' => 'لا يمكن تغيير حدود أو بيانات اعتماد فترة مغلقة.']);
            }
        });
        static::deleting(function (self $period): void {
            if ($period->status->isClosed() || $period->transactions()->exists()) {
                throw ValidationException::withMessages(['period' => 'لا يمكن حذف فترة مالية مسجلة.']);
            }
        });
    }

    public function closing(): BelongsTo
    {
        return $this->belongsTo(Closing::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(SubscriptionTransaction::class);
    }
}
