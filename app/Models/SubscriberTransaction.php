<?php

namespace App\Models;

use App\Enums\ChargeType;
use App\Enums\Currency;
use App\Enums\DiscountMethod;
use App\Enums\PaymentMethod;
use Database\Factories\SubscriberTransactionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * One line of a subscriber's account. `amount` is its effect on the
 * balance in shekels: charges (تحميل) are positive, payments and discounts
 * negative, so the balance is the sum of `amount`. A charge recorded by
 * hand stores its ChargeType as its `type`. A discount with a
 * `meter_reading_id` is that approved reading's standing discount.
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
    'sender_name',
    'reference_number',
    'voucher_number',
    'manual_voucher_number',
    'cash_box',
    'discount_method',
    'discount_value',
    'discount_base',
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

    /** An amount taken off what the subscriber owes. */
    public const TYPE_DISCOUNT = 'discount';

    /**
     * The lines in the subscriber's favour (له); every other type is a
     * charge (عليه).
     */
    public const CREDIT_TYPES = [self::TYPE_PAYMENT, self::TYPE_DISCOUNT];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'currency' => Currency::class,
            'currency_amount' => 'decimal:2',
            'exchange_rate' => 'decimal:4',
            'payment_method' => PaymentMethod::class,
            'discount_method' => DiscountMethod::class,
            'discount_value' => 'decimal:2',
            'discount_base' => 'decimal:2',
        ];
    }

    /**
     * Record a payment on the subscriber's account, converted to shekels
     * at `exchange_rate` (always 1 for shekels), with the next voucher
     * number. A transfer keeps its bank, sender and reference; cash keeps
     * its cash box and paper voucher.
     *
     * @param  array{amount: float|string, currency: string, exchange_rate?: float|string|null, payment_method: string, bank_name?: ?string, sender_name?: ?string, reference_number?: ?string, manual_voucher_number?: ?string, cash_box?: ?string, notes?: ?string}  $payment
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
                'sender_name' => $method->throughBank() ? ($payment['sender_name'] ?? null) : null,
                'reference_number' => $method === PaymentMethod::Cash ? null : ($payment['reference_number'] ?? null),
                'voucher_number' => $voucherNumber,
                'manual_voucher_number' => $method === PaymentMethod::Cash ? ($payment['manual_voucher_number'] ?? null) : null,
                'cash_box' => $method === PaymentMethod::Cash ? ($payment['cash_box'] ?? null) : null,
                'notes' => $payment['notes'] ?? null,
            ]);
        });
    }

    /**
     * Charge the subscriber a settlement, penalty or disconnection fee.
     */
    public static function recordCharge(Subscriber $subscriber, User $recorder, ChargeType $type, float|string $amount, ?string $notes): self
    {
        return $subscriber->transactions()->create([
            'recorded_by' => $recorder->id,
            'type' => $type->value,
            'source_key' => 'charge:'.Str::ulid(),
            'amount' => number_format((float) $amount, 2, '.', ''),
            'notes' => $notes,
        ]);
    }

    /**
     * Take a discount off what the subscriber owes, worked out by
     * discountFor() from their current balance and kilo price.
     */
    public static function recordDiscount(Subscriber $subscriber, User $recorder, DiscountMethod $method, float|string $value, ?string $notes): self
    {
        $base = match ($method) {
            DiscountMethod::Percentage => $subscriber->balance(),
            DiscountMethod::Kilowatt => (float) $subscriber->tariff->rate,
            DiscountMethod::Shekel => null,
        };

        return $subscriber->transactions()->create([
            'recorded_by' => $recorder->id,
            'type' => self::TYPE_DISCOUNT,
            'source_key' => 'discount:'.Str::ulid(),
            'amount' => number_format(-self::discountFor($method, $value, $base), 2, '.', ''),
            'discount_method' => $method,
            'discount_value' => $value,
            'discount_base' => $base,
            'notes' => $notes,
        ]);
    }

    /**
     * What a discount takes off, in shekels: a percentage of the balance
     * owed, kilowatts at the kilo price, or the shekels given.
     */
    public static function discountFor(DiscountMethod $method, float|string $value, float|string|null $base): float
    {
        return round(match ($method) {
            DiscountMethod::Percentage => (float) $base * (float) $value / 100,
            DiscountMethod::Kilowatt => (float) $value * (float) $base,
            DiscountMethod::Shekel => (float) $value,
        }, 2);
    }

    /**
     * An amount as the app shows it: no decimals when whole (50), two
     * otherwise (617.50).
     */
    public static function formatAmount(float|string $amount): string
    {
        return Str::replaceEnd('.00', '', number_format((float) $amount, 2, '.', ''));
    }

    /**
     * The voucher number as it is printed, six digits (000042), or null
     * for a line that has none.
     */
    public function printedVoucherNumber(): ?string
    {
        return $this->voucher_number ? str_pad((string) $this->voucher_number, 6, '0', STR_PAD_LEFT) : null;
    }

    public function isPayment(): bool
    {
        return $this->type === self::TYPE_PAYMENT;
    }

    /**
     * Whether the line is in the subscriber's favour (له): a payment or a
     * discount. Everything else is a charge (عليه).
     */
    public function isCredit(): bool
    {
        return in_array($this->type, self::CREDIT_TYPES, true);
    }

    /**
     * Only the charges (عليه): readings, fees, settlements and penalties.
     */
    #[Scope]
    protected function charges(Builder $query): void
    {
        $query->whereNotIn($query->qualifyColumn('type'), self::CREDIT_TYPES);
    }

    /**
     * Only the lines in the subscriber's favour (له): payments and discounts.
     */
    #[Scope]
    protected function credits(Builder $query): void
    {
        $query->whereIn($query->qualifyColumn('type'), self::CREDIT_TYPES);
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
                    'قراءة أسبوعية من %s إلى %s · %s كيلو',
                    $this->meterReading->week_start->format('Y-m-d'),
                    $this->meterReading->week_end->format('Y-m-d'),
                    $this->meterReading->consumption,
                )
                : 'قراءة أسبوعية',
            self::TYPE_PAYMENT => match ($this->payment_method) {
                PaymentMethod::Cash => 'دفعة نقدية',
                PaymentMethod::BankTransfer => $this->sender_name ? 'دفعة بتحويل بنكي من '.$this->sender_name : 'دفعة بتحويل بنكي',
                PaymentMethod::Cheque => 'دفعة بشيك',
                PaymentMethod::EWallet => 'دفعة بمحفظة إلكترونية',
                default => 'دفعة',
            },
            self::TYPE_DISCOUNT => $this->meter_reading_id
                ? 'خصم دائم على القراءة الأسبوعية: '.StandingDiscount::termsFor($this->discount_method, $this->discount_value)
                : match ($this->discount_method) {
                    DiscountMethod::Percentage => sprintf('خصم %s%% من الرصيد المستحق (%s شيكل)', self::formatAmount($this->discount_value), self::formatAmount($this->discount_base)),
                    DiscountMethod::Kilowatt => sprintf('خصم %s كيلو × %s شيكل', self::formatAmount($this->discount_value), self::formatAmount($this->discount_base)),
                    default => 'خصم بمبلغ ثابت',
                },
            default => $this->typeLabel(),
        };
    }

    /**
     * The type of line, shown with its عليه / له tag.
     */
    public function typeLabel(): string
    {
        return self::typeLabels()[$this->type] ?? 'حركة';
    }

    /**
     * Every type of line and its name, charges first.
     *
     * @return array<string, string>
     */
    public static function typeLabels(): array
    {
        return [
            self::TYPE_METER_READING => 'قراءة أسبوعية',
            self::TYPE_SUBSCRIPTION_FEE => 'رسوم اشتراك',
            ...collect(ChargeType::cases())->mapWithKeys(fn (ChargeType $type) => [$type->value => __($type->label())])->all(),
            self::TYPE_PAYMENT => 'دفعة',
            self::TYPE_DISCOUNT => 'خصم',
        ];
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
