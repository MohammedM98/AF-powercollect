<?php

namespace App\Models;

use App\Enums\ChargeType;
use App\Enums\CorrectionReason;
use App\Enums\Currency;
use App\Enums\DiscountMethod;
use App\Enums\PaymentMethod;
use Closure;
use Database\Factories\SubscriberTransactionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * One line of a subscriber's account. `amount` is its effect on the
 * balance in shekels: charges (تحميل) are positive, payments and discounts
 * negative, so the balance is the sum of `amount`. A charge recorded by
 * hand stores its ChargeType as its `type`.
 *
 * A line is never edited or removed. Deleting it cancels it — marked with
 * who, when and why — and adds a reversal line under it that takes its
 * amount back off the balance; correcting it does the same, then records
 * the right line in its place (`corrects_id`). The cancelled line and its
 * reversal cancel each other out, so the totals leave both out.
 */
#[Fillable([
    'subscriber_id',
    'recorded_by',
    'meter_reading_id',
    'reverses_id',
    'corrects_id',
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
    'cancelled_at',
    'cancelled_by',
    'cancellation_reason',
    'cancellation_notes',
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
     * The standing discount taken off an approved weekly reading, beside
     * the reading's own line.
     */
    public const TYPE_READING_DISCOUNT = 'reading_discount';

    /**
     * Takes a cancelled line's amount back off the balance, on the other
     * side of the account from it.
     */
    public const TYPE_REVERSAL = 'reversal';

    /**
     * The lines in the subscriber's favour (له); every other type is a
     * charge (عليه).
     */
    public const CREDIT_TYPES = [self::TYPE_PAYMENT, self::TYPE_DISCOUNT, self::TYPE_READING_DISCOUNT];

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
            'cancelled_at' => 'datetime',
            'cancellation_reason' => CorrectionReason::class,
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
     * Delete the line: mark it cancelled — by whom, when and why — and add
     * the reversal under it that takes its amount back off the balance.
     * Returns the reversal.
     *
     * @throws ValidationException when the line was cancelled meanwhile
     */
    public function cancel(User $actor, CorrectionReason $reason, ?string $notes): self
    {
        return DB::transaction(function () use ($actor, $reason, $notes): self {
            $line = self::query()->lockForUpdate()->findOrFail($this->id);

            if (! $line->isCorrectable()) {
                throw ValidationException::withMessages(['reason' => 'هذه الحركة أُلغيت أو عُدّلت من قبل.']);
            }

            $line->update([
                'cancelled_at' => now(),
                'cancelled_by' => $actor->id,
                'cancellation_reason' => $reason,
                'cancellation_notes' => $notes,
            ]);
            $this->setRawAttributes($line->getAttributes(), true);

            return $line->subscriber->transactions()->create([
                'recorded_by' => $actor->id,
                'reverses_id' => $line->id,
                'type' => self::TYPE_REVERSAL,
                'source_key' => 'reversal:'.$line->id,
                'amount' => number_format(-(float) $line->amount, 2, '.', ''),
                'currency' => $line->currency,
                'currency_amount' => $line->currency_amount,
                'exchange_rate' => $line->exchange_rate,
                'payment_method' => $line->payment_method,
            ]);
        });
    }

    /**
     * Correct the line: cancel it as cancel() does, then record the right
     * line in its place with `$record`, which gets the subscriber (whose
     * balance no longer counts this line) and returns the new line.
     *
     * @param  Closure(Subscriber): self  $record
     */
    public function correct(User $actor, CorrectionReason $reason, ?string $notes, Closure $record): self
    {
        return DB::transaction(function () use ($actor, $reason, $notes, $record): self {
            $this->cancel($actor, $reason, $notes);

            $replacement = $record($this->subscriber);
            $replacement->update(['corrects_id' => $this->id]);

            return $replacement;
        });
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

    public function isCancelled(): bool
    {
        return $this->cancelled_at !== null;
    }

    public function isReversal(): bool
    {
        return $this->type === self::TYPE_REVERSAL;
    }

    /**
     * Whether a line may be corrected or deleted: a payment, discount or
     * charge recorded by hand that still stands. Weekly readings, their
     * standing discounts and the subscription fee are billed by their own
     * flows.
     */
    public function isCorrectable(): bool
    {
        return ! $this->isCancelled() && in_array($this->type, self::correctableTypes(), true);
    }

    /**
     * The types of line a user may correct or delete.
     *
     * @return array<int, string>
     */
    public static function correctableTypes(): array
    {
        return [self::TYPE_PAYMENT, self::TYPE_DISCOUNT, ...array_map(fn (ChargeType $type): string => $type->value, ChargeType::cases())];
    }

    public function isPayment(): bool
    {
        return $this->type === self::TYPE_PAYMENT;
    }

    /**
     * Whether the line is a discount: one given by hand, or a weekly
     * reading's standing discount.
     */
    public function isDiscount(): bool
    {
        return in_array($this->type, [self::TYPE_DISCOUNT, self::TYPE_READING_DISCOUNT], true);
    }

    /**
     * Whether the line is in the subscriber's favour (له): a payment or a
     * discount, or the reversal of a charge. Everything else is a charge
     * (عليه).
     */
    public function isCredit(): bool
    {
        return $this->isReversal() ? (float) $this->amount < 0 : in_array($this->type, self::CREDIT_TYPES, true);
    }

    /**
     * Only the lines that count in the totals: neither cancelled nor the
     * reversal of a cancelled line, which cancel each other out.
     */
    #[Scope]
    protected function counted(Builder $query): void
    {
        $query->whereNull($query->qualifyColumn('cancelled_at'))->whereNull($query->qualifyColumn('reverses_id'));
    }

    /**
     * Only the charges (عليه) that count: readings, fees, settlements and
     * penalties.
     */
    #[Scope]
    protected function charges(Builder $query): void
    {
        $query->counted()->whereNotIn($query->qualifyColumn('type'), [...self::CREDIT_TYPES, self::TYPE_REVERSAL]);
    }

    /**
     * Only the lines in the subscriber's favour (له) that count: payments
     * and discounts.
     */
    #[Scope]
    protected function credits(Builder $query): void
    {
        $query->counted()->whereIn($query->qualifyColumn('type'), self::CREDIT_TYPES);
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
            self::TYPE_DISCOUNT => 'خصم لمرة واحدة · '.match ($this->discount_method) {
                DiscountMethod::Percentage => sprintf('نسبة %s%% من الرصيد المستحق (%s شيكل)', self::formatAmount($this->discount_value), self::formatAmount($this->discount_base)),
                DiscountMethod::Kilowatt => sprintf('%s كيلو × %s شيكل', self::formatAmount($this->discount_value), self::formatAmount($this->discount_base)),
                default => 'مبلغ ثابت',
            },
            self::TYPE_READING_DISCOUNT => implode(' · ', array_filter([
                'خصم دائم',
                match ($this->discount_method) {
                    DiscountMethod::Percentage => 'نسبة '.self::formatAmount($this->discount_value).'%',
                    DiscountMethod::Kilowatt => self::formatAmount($this->discount_value).' كيلو مجاني',
                    default => self::formatAmount($this->discount_value).' شيكل من سعر الكيلو',
                },
                $this->readingDiscountSegment(),
            ])),
            self::TYPE_REVERSAL => $this->reverses
                ? 'إلغاء: '.$this->reverses->description().($this->reverses->voucher_number ? ' · سند '.$this->reverses->printedVoucherNumber() : '')
                : 'قيد عكسي',
            default => $this->typeLabel(),
        };
    }

    /**
     * The customer segment a weekly reading's standing discount was given
     * to, or null when none was named.
     */
    public function readingDiscountSegment(): ?string
    {
        return $this->meterReading?->discount_segment ?? $this->notes;
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
            self::TYPE_READING_DISCOUNT => 'خصم دائم',
            self::TYPE_REVERSAL => 'قيد عكسي',
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

    public function cancelledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }

    /**
     * The cancelled line a reversal takes back.
     */
    public function reverses(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reverses_id');
    }

    /**
     * The cancelled line a correction replaces.
     */
    public function corrects(): BelongsTo
    {
        return $this->belongsTo(self::class, 'corrects_id');
    }

    /**
     * The line that replaced this one, when it was corrected rather than
     * deleted.
     */
    public function correction(): HasOne
    {
        return $this->hasOne(self::class, 'corrects_id');
    }
}
