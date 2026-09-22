<?php

namespace App\Models;

use App\Enums\SubscriberStatus;
use Database\Factories\SubscriberFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'full_name', 'national_id', 'phone', 'meter_number', 'meter_box_id', 'tariff_id', 'branch_id',
    'registered_by', 'status', 'circuit_breaker_id', 'initial_reading', 'subscription_fee',
    'subscription_date', 'notes',
])]
class Subscriber extends Model
{
    /** @use HasFactory<SubscriberFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return [
            'status' => SubscriberStatus::class,
            'subscription_date' => 'date',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function meterBox(): BelongsTo
    {
        return $this->belongsTo(MeterBox::class);
    }

    public function tariff(): BelongsTo
    {
        return $this->belongsTo(Tariff::class);
    }

    public function circuitBreaker(): BelongsTo
    {
        return $this->belongsTo(CircuitBreaker::class);
    }

    public function registeredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'registered_by');
    }
}
