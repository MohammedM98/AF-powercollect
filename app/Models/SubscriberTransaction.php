<?php

namespace App\Models;

use App\Enums\Currency;
use App\Enums\PaymentMethod;
use Database\Factories\SubscriberTransactionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

/**
 * One line of a subscriber's account. `amount` is its effect on the
 * balance in shekels: charges are positive, payments negative, so the
 * balance is the sum of `amount`.
 */
#[Fillable([
    'subscriber_id',
    'recorded_by',
    'meter_reading_id',
    'type',
    'source_key',
    'amount',
    'currency',
    'currency_amount',
    'exchange_rate',
    'payment_method',
    'bank_name',
    'reference_number',
    'voucher_number',
    'manual_voucher_number',
    'cash_box',
    'notes',
])]
class SubscriberTransaction extends Model
{
    /** @use HasFactory<SubscriberTransactionFactory> */
    use HasFactory;

    /** The fee charged when a subscriber is registered. */
    public const TYPE_SUBSCRIPTION_FEE = 'subscription_fee';

    /** An approved weekly reading's amount due. */
    public const TYPE_METER_READING = 'meter_reading';

    /** Money the subscriber paid. */
    public const TYPE_PAYMENT = 'payment';

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'currency' => Currency::class,
            'currency_amount' => 'decimal:2',
            'exchange_rate' => 'decimal:4',
            'payment_method' => PaymentMethod::class,
        ];
    }

    /**
     * Record a payment on the subscriber's account, converted to shekels
     * at `exchange_rate` (always 1 for shekels), with the next voucher
     * number.
     *
     * @param  array{amount: float|string, currency: string, exchange_rate?: float|string|null, payment_method: string, bank_name?: ?string, reference_number?: ?string, manual_voucher_number?: ?string, cash_box?: ?string, notes?: ?string}  $payment
     */
    public static function recordPayment(Subscriber $subscriber, User $collector, array $payment): self
    {
        $currency = Currency::from($payment['currency']);
        $method = PaymentMethod::from($payment['payment_method']);
        $exchangeRate = $currency === Currency::Shekel ? 1.0 : (float) $payment['exchange_rate'];
        $inShekels = round((float) $payment['amount'] * $exchangeRate, 2);

        return DB::transaction(function () use ($subscriber, $collector, $payment, $currency, $method, $exchangeRate, $inShekels): self {
            $voucherNumber = (int) self::query()->lockForUpdate()->max('voucher_number') + 1;

            return $subscriber->transactions()->create([
                'recorded_by' => $collector->id,
                'type' => self::TYPE_PAYMENT,
                'source_key' => 'payment:'.$voucherNumber,
                'amount' => number_format(-$inShekels, 2, '.', ''),
                'currency' => $currency,
                'currency_amount' => $payment['amount'],
                'exchange_rate' => $exchangeRate,
                'payment_method' => $method,
                'bank_name' => $method->throughBank() ? $payment['bank_name'] : null,
                'reference_number' => $method === PaymentMethod::Cash ? null : ($payment['reference_number'] ?? null),
                'voucher_number' => $voucherNumber,
                'manual_voucher_number' => $payment['manual_voucher_number'] ?? null,
                'cash_box' => $method === PaymentMethod::Cash ? ($payment['cash_box'] ?? null) : null,
                'notes' => $payment['notes'] ?? null,
            ]);
        });
    }

    public function isPayment(): bool
    {
        return $this->type === self::TYPE_PAYMENT;
    }

    /**
     * The statement's البيان for this line.
     */
    public function description(): string
    {
        return match ($this->type) {
            self::TYPE_SUBSCRIPTION_FEE => 'رسوم اشتراك جديد',
            self::TYPE_METER_READING => $this->meterReading
                ? sprintf(
                    'قراءة أسبوعية من %s إلى %s · %d كيلو',
                    $this->meterReading->week_start->format('Y-m-d'),
                    $this->meterReading->week_end->format('Y-m-d'),
                    $this->meterReading->consumption,
                )
                : 'قراءة أسبوعية',
            self::TYPE_PAYMENT => match ($this->payment_method) {
                PaymentMethod::Cash => 'دفعة نقدية',
                PaymentMethod::BankTransfer => 'دفعة بتحويل بنكي',
                PaymentMethod::Cheque => 'دفعة بشيك',
                PaymentMethod::EWallet => 'دفعة بمحفظة إلكترونية',
                default => 'دفعة',
            },
            default => 'حركة',
        };
    }

    /**
     * What kind of line this is, under its عليه / له tag.
     */
    public function kindLabel(): string
    {
        return match ($this->type) {
            self::TYPE_SUBSCRIPTION_FEE => 'تحميل · رسوم اشتراك',
            self::TYPE_METER_READING => 'تحميل · قراءة أسبوعية',
            self::TYPE_PAYMENT => 'تسديد · دفعة',
            default => 'حركة',
        };
    }

    public function subscriber(): BelongsTo
    {
        return $this->belongsTo(Subscriber::class);
    }

    public function recordedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function meterReading(): BelongsTo
    {
        return $this->belongsTo(MeterReading::class);
    }
}
