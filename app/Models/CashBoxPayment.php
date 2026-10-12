<?php

namespace App\Models;

use Database\Factories\CashBoxPaymentFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['cash_box_id', 'subscription_transaction_id', 'currency', 'amount', 'method', 'status', 'occurred_at', 'synced_at', 'is_late', 'confirmed_in_closing_id', 'confirmed_by', 'confirmed_at'])]
class CashBoxPayment extends Model
{
    /** @use HasFactory<CashBoxPaymentFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'occurred_at' => 'immutable_datetime', 'synced_at' => 'datetime', 'confirmed_at' => 'datetime', 'is_late' => 'boolean'];
    }

    public function box(): BelongsTo
    {
        return $this->belongsTo(CashBox::class, 'cash_box_id');
    }

    public function transaction(): BelongsTo
    {
        return $this->belongsTo(SubscriptionTransaction::class, 'subscription_transaction_id');
    }
}
