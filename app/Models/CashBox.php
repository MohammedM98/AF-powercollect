<?php

namespace App\Models;

use Database\Factories\CashBoxFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['number', 'branch_id', 'user_id', 'kind', 'open_key', 'closing_id', 'status', 'opened_at', 'closed_at', 'close_reason', 'collector_counts', 'head_counts', 'expected_counts', 'decisions', 'reason', 'received_by', 'received_at', 'confirmed_at'])]
class CashBox extends Model
{
    /** @use HasFactory<CashBoxFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return ['collector_counts' => 'array', 'head_counts' => 'array', 'expected_counts' => 'array', 'decisions' => 'array', 'opened_at' => 'immutable_datetime', 'closed_at' => 'immutable_datetime', 'received_at' => 'datetime', 'confirmed_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function closing(): BelongsTo
    {
        return $this->belongsTo(Closing::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(CashBoxPayment::class);
    }
}
