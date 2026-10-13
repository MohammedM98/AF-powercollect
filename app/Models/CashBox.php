<?php

namespace App\Models;

use App\Enums\CashBoxType;
use App\Support\BranchClosingWorkflow;
use Database\Factories\CashBoxFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['number', 'branch_id', 'user_id', 'kind', 'type', 'open_key', 'closing_id', 'status', 'opened_at', 'closed_at', 'collector_submitted_at', 'close_reason', 'collector_counts', 'head_counts', 'expected_counts', 'decisions', 'reason', 'received_by', 'received_at', 'received_in_closing_id', 'confirmed_at'])]
class CashBox extends Model
{
    /** @use HasFactory<CashBoxFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return ['type' => CashBoxType::class, 'collector_submitted_at' => 'datetime', 'collector_counts' => 'array', 'head_counts' => 'array', 'expected_counts' => 'array', 'decisions' => 'array', 'opened_at' => 'immutable_datetime', 'closed_at' => 'immutable_datetime', 'received_at' => 'datetime', 'confirmed_at' => 'datetime'];
    }

    public function stage(): string
    {
        return match (true) {
            $this->status === 'open' => 'open',
            $this->status === 'pending' => 'awaiting_branch',
            $this->status === 'received' && $this->type->isCounted() && ! $this->confirmed_at => 'awaiting_confirmation',
            default => 'completed',
        };
    }

    /**
     * Whether its collector may still correct the box's entries: until the
     * branch confirms it closed, even once closed at the weekly cutoff.
     */
    public function isEditable(): bool
    {
        return in_array($this->status, ['open', 'pending'], true);
    }

    /** @return array<string, string> */
    public function totals(): array
    {
        $this->loadMissing('payments.transaction');
        $entries = $this->payments->filter(fn (CashBoxPayment $entry): bool => $entry->transaction?->status === SubscriptionTransaction::STATUS_ACTIVE);

        return collect(BranchClosingWorkflow::CURRENCIES)->mapWithKeys(fn (string $currency): array => [
            $currency => Closing::money($entries->where('currency', $currency)->sum(fn (CashBoxPayment $entry): int => Closing::cents($entry->amount))),
        ])->all();
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

    public function receivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function receivedIn(): BelongsTo
    {
        return $this->belongsTo(Closing::class, 'received_in_closing_id');
    }
}
