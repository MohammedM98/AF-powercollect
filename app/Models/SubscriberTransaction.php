<?php

namespace App\Models;

use Database\Factories\SubscriberTransactionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['subscriber_id', 'recorded_by', 'type', 'source_key', 'amount'])]
class SubscriberTransaction extends Model
{
    /** @use HasFactory<SubscriberTransactionFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return ['amount' => 'decimal:2'];
    }

    public function subscriber(): BelongsTo
    {
        return $this->belongsTo(Subscriber::class);
    }

    public function recordedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
