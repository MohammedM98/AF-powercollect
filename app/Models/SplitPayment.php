<?php

namespace App\Models;

use Database\Factories\SplitPaymentFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

/**
 * One bank transfer divided between several subscriptions: what the payer
 * sent in one piece, and the payments — one per subscription — it became.
 */
#[Fillable(['reference_number', 'bank_name', 'sender_bank_name', 'sender_name', 'total_amount', 'notes', 'recorded_by'])]
class SplitPayment extends Model
{
    /** @use HasFactory<SplitPaymentFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return [
            'total_amount' => 'decimal:2',
        ];
    }

    public function recordedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    /**
     * The payments it was divided into, the first one recorded first.
     * Cancelled, refunded or corrected ones stay listed.
     */
    public function payments(): HasMany
    {
        return $this->hasMany(SubscriptionTransaction::class)->oldest()->orderBy('id');
    }

    /**
     * Record the transfer and a payment on each subscription for its share,
     * all together or not at all. `$shared` is what the payments have in
     * common (the bank, the sender, the reference, the notes) and `$parts`
     * lists each subscription with its amount. A reference already on another
     * payment is refused unless the collector confirmed the duplicate; the
     * parts themselves share it, which is not a duplicate.
     *
     * @param  array{total_amount: float|string, bank_name: string, sender_bank_name?: ?string, sender_name: string, reference_number: string, notes?: ?string, confirm_duplicate_reference?: bool}  $shared
     * @param  array<int, array{subscription: Subscription, amount: float|string}>  $parts
     */
    public static function record(User $collector, array $shared, array $parts): self
    {
        return DB::transaction(function () use ($collector, $shared, $parts): self {
            $split = self::create([
                'reference_number' => trim($shared['reference_number']),
                'bank_name' => $shared['bank_name'],
                'sender_bank_name' => $shared['sender_bank_name'] ?? null,
                'sender_name' => trim($shared['sender_name']),
                'total_amount' => $shared['total_amount'],
                'notes' => $shared['notes'] ?? null,
                'recorded_by' => $collector->id,
            ]);

            foreach ($parts as $part) {
                SubscriptionTransaction::recordPayment($part['subscription'], $collector, [
                    'amount' => $part['amount'],
                    'currency' => 'ILS',
                    'payment_method' => 'bank_transfer',
                    'bank_name' => $split->bank_name,
                    'sender_bank_name' => $split->sender_bank_name,
                    'sender_name' => $split->sender_name,
                    'reference_number' => $split->reference_number,
                    'notes' => $split->notes,
                    'split_payment_id' => $split->id,
                    // The parts share the reference on purpose; another payment holding it is still a duplicate.
                    'confirm_duplicate_reference' => $shared['confirm_duplicate_reference'] ?? false,
                ]);
            }

            return $split;
        });
    }

    /**
     * What a payment that is part of it shows next to its reference, for the
     * badge that opens the transfer's details.
     *
     * @return array{id: int, total: string}
     */
    public function badge(): array
    {
        return ['id' => $this->id, 'total' => SubscriptionTransaction::formatAmount($this->total_amount)];
    }

    /**
     * The sum of its payments still standing, in shekels: the transfer's
     * parts less any cancelled, refunded or corrected since.
     */
    public function standingTotal(): string
    {
        return number_format(
            $this->payments()->whereNull('cancelled_at')->get()->sum(fn (SubscriptionTransaction $payment): float => -(float) $payment->amount),
            2,
            '.',
            '',
        );
    }
}
