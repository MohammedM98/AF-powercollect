<?php

namespace App\Models;

use App\Enums\BillingType;
use App\Enums\SubscriberStatus;
use Database\Factories\SubscriberFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'full_name', 'phone', 'address', 'meter_number', 'meter_box_id', 'tariff_id', 'branch_id',
    'registered_by', 'status', 'billing_type', 'unit_price', 'minimum_charge', 'ampere_count',
    'area_1', 'area_2', 'customer_classification', 'previous_reading', 'subscription_fee',
    'subscription_date', 'charge_subscription_fee', 'notes',
])]
class Subscriber extends Model
{
    /** @use HasFactory<SubscriberFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return [
            'status' => SubscriberStatus::class,
            'billing_type' => BillingType::class,
            'charge_subscription_fee' => 'boolean',
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

    public function registeredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'registered_by');
    }
}
