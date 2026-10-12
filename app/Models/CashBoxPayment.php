<?php

namespace App\Models;

use Database\Factories\CashBoxPaymentFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['cash_box_id', 'subscription_transaction_id', 'currency', 'amount', 'method', 'status', 'occurred_at', 'synced_at', 'is_late', 'confirmed_in_closing_id', 'confirmed_by', 'confirmed_at', 'returned_at', 'returned_by', 'return_note', 'collector_reply', 'replied_at'])]
class CashBoxPayment extends Model
{
    /** @use HasFactory<CashBoxPaymentFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'occurred_at' => 'immutable_datetime', 'synced_at' => 'datetime', 'confirmed_at' => 'datetime', 'is_late' => 'boolean', 'returned_at' => 'datetime', 'replied_at' => 'datetime'];
    }

    public function box(): BelongsTo
    {
        return $this->belongsTo(CashBox::class, 'cash_box_id');
    }

    public function transaction(): BelongsTo
    {
        return $this->belongsTo(SubscriptionTransaction::class, 'subscription_transaction_id');
    }

    public function returnedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'returned_by');
    }

    /** Whether the branch sent the entry back to its collector and still waits on their answer. */
    public function waitsOnCollector(): bool
    {
        return $this->returned_at !== null && $this->replied_at === null;
    }

    /**
     * The entries the branch sent back to their collector and still waiting
     * on the answer.
     *
     * @param  Builder<CashBoxPayment>  $query
     */
    #[Scope]
    protected function waitingOnCollector(Builder $query): void
    {
        $query->whereNotNull('returned_at')->whereNull('replied_at');
    }
}
