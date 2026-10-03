<?php

namespace App\Models;

use App\Enums\ChargeType;
use App\Enums\ClosingStatus;
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
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * One line of a subscriber's account. `amount` is its effect on the
 * balance in shekels: charges (تحميل) are positive, payments, discounts
 * and clearings negative, so the balance is the sum of `amount`. A charge
 * recorded by hand stores its ChargeType as its `type`.
 *
 * A line is normally never edited or removed. Deleting it cancels it —
 * marked with who, when and why — and adds a later reversal line that
 * takes its amount back off the balance; correcting it does the same, then
 * records the right line in its place (`corrects_id`). A separate sensitive
 * permission may permanently erase only the final line of the statement.
 */
#[Fillable([
    'subscriber_id',
    'recorded_by',
    'meter_reading_id',
    'reverses_id',
    'corrects_id',
    'type',
    'source_key',
    'mobile_operation_id',
    'amount',
    'currency',
    'currency_amount',
    'exchange_rate',
    'payment_method',
    'bank_name',
    'sender_bank_name',
    'sender_name',
    'reference_number',
    'active_reference',
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
     * A clearing (مقاصة): a service the subscriber gave the company, whose
     * value comes off what they owe as a payment would.
     */
    public const TYPE_CLEARING = 'clearing';

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
    public const CREDIT_TYPES = [self::TYPE_PAYMENT, self::TYPE_DISCOUNT, self::TYPE_READING_DISCOUNT, self::TYPE_CLEARING];

    /** Payment details that may change without touching its financial meaning. */
    public const AMENDABLE_FIELDS = ['bank_name', 'sender_bank_name', 'sender_name', 'reference_number', 'notes'];

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
     * @param  array{amount: float|string, currency: string, exchange_rate?: float|string|null, payment_method: string, bank_name?: ?string, sender_bank_name?: ?string, sender_name?: ?string, reference_number?: ?string, manual_voucher_number?: ?string, cash_box?: ?string, notes?: ?string, mobile_operation_id?: ?string}  $payment
     */
    public static function recordPayment(Subscriber $subscriber, User $collector, array $payment): self
    {
        $currency = Currency::from($payment['currency']);
        $method = PaymentMethod::from($payment['payment_method']);
        $exchangeRate = $currency === Currency::Shekel ? 1.0 : (float) $payment['exchange_rate'];
        $inShekels = round((float) $payment['amount'] * $exchangeRate, 2);
        $referenceNumber = $method === PaymentMethod::Cash ? null : trim((string) ($payment['reference_number'] ?? ''));
        $activeReference = self::normalizeReference($referenceNumber);

        try {
            return DB::transaction(function () use ($subscriber, $collector, $payment, $currency, $method, $exchangeRate, $inShekels, $referenceNumber, $activeReference): self {
                self::ensureReferenceIsAvailable($activeReference);
                $voucherNumber = self::claimNextVoucherNumber();

                return $subscriber->transactions()->create([
                    'recorded_by' => $collector->id,
                    'type' => self::TYPE_PAYMENT,
                    'source_key' => 'payment:'.$voucherNumber,
                    'mobile_operation_id' => $payment['mobile_operation_id'] ?? null,
                    'amount' => number_format(-$inShekels, 2, '.', ''),
                    'currency' => $currency,
                    'currency_amount' => $payment['amount'],
                    'exchange_rate' => $exchangeRate,
                    'payment_method' => $method,
                    'bank_name' => $method->throughBank() ? $payment['bank_name'] : null,
                    'sender_bank_name' => $method->throughBank() ? ($payment['sender_bank_name'] ?? null) : null,
                    'sender_name' => $method->throughBank() ? ($payment['sender_name'] ?? null) : null,
                    'reference_number' => $referenceNumber ?: null,
                    'active_reference' => $activeReference,
                    'voucher_number' => $voucherNumber,
                    'manual_voucher_number' => $method === PaymentMethod::Cash ? ($payment['manual_voucher_number'] ?? null) : null,
                    'cash_box' => $method === PaymentMethod::Cash ? ($payment['cash_box'] ?? null) : null,
                    'notes' => $payment['notes'] ?? null,
                ]);
            });
        } catch (UniqueConstraintViolationException $exception) {
            if (isset($payment['mobile_operation_id']) && self::query()->where('mobile_operation_id', $payment['mobile_operation_id'])->exists()) {
                throw $exception;
            }

            self::throwReferenceConflictAfterUniqueViolation($activeReference, $exception);
        }
    }

    /**
     * Reserve the next global voucher number. The counter survives permanent
     * payment deletion, leaving the deliberate gap in the voucher sequence.
     */
    private static function claimNextVoucherNumber(): int
    {
        $counter = DB::table('payment_voucher_sequences')->where('id', 1);
        $voucherNumber = (int) $counter->lockForUpdate()->value('last_number') + 1;

        $counter->update(['last_number' => $voucherNumber]);

        return $voucherNumber;
    }

    /**
     * Charge the subscriber a penalty, disconnection fee or subscription fee.
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
     * Take the value of a service the subscriber gave the company off what
     * they owe; `$service` says what it was. It may leave them in credit.
     */
    public static function recordClearing(Subscriber $subscriber, User $recorder, float|string $amount, string $service): self
    {
        return $subscriber->transactions()->create([
            'recorded_by' => $recorder->id,
            'type' => self::TYPE_CLEARING,
            'source_key' => 'clearing:'.Str::ulid(),
            'amount' => number_format(-(float) $amount, 2, '.', ''),
            'notes' => $service,
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
     * a reversal that takes its amount back off the balance.
     * Returns the reversal.
     *
     * @throws ValidationException when the line was cancelled meanwhile
     */
    public function cancel(User $actor, CorrectionReason $reason, ?string $notes): self
    {
        return $this->reverse($actor, $reason, $notes, fn (self $line): bool => $line->isCancellable());
    }

    /**
     * Cancel a weekly reading's charge or standing-discount line when the
     * reading is corrected or rebilled, as cancel() does. Its key is freed
     * so the line the reading is billed with next can take it.
     */
    public function cancelForReading(User $actor, CorrectionReason $reason): self
    {
        return $this->reverse($actor, $reason, null, fn (self $line): bool => ! $line->isCancelled(), freeSourceKey: true);
    }

    /**
     * Mark the line cancelled and add its reversal, once `$mayCancel`
     * allows it on the locked line.
     *
     * @param  Closure(self): bool  $mayCancel
     *
     * @throws ValidationException when it may not be cancelled (any more)
     */
    private function reverse(User $actor, CorrectionReason $reason, ?string $notes, Closure $mayCancel, bool $freeSourceKey = false): self
    {
        return DB::transaction(function () use ($actor, $reason, $notes, $mayCancel, $freeSourceKey): self {
            $line = self::query()->lockForUpdate()->findOrFail($this->id);

            if (! $mayCancel($line)) {
                throw ValidationException::withMessages(['reason' => 'هذه الحركة أُلغيت أو عُدّلت من قبل.']);
            }

            $line->update([
                'cancelled_at' => now(),
                'cancelled_by' => $actor->id,
                'cancellation_reason' => $reason,
                'cancellation_notes' => $notes,
                'active_reference' => null,
                ...($freeSourceKey ? ['source_key' => $line->source_key.':cancelled:'.$line->id] : []),
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
     * Change only descriptive payment details and record every old/new value.
     * Amount, currency, method, date, type and subscriber never pass this boundary.
     *
     * @param  array<string, mixed>  $fields
     */
    public function amend(User $actor, array $fields, string $reason): TransactionAmendment
    {
        $unexpectedFields = array_diff(array_keys($fields), self::AMENDABLE_FIELDS);

        if ($unexpectedFields !== []) {
            throw ValidationException::withMessages(['details' => 'لا يمكن تعديل الحقول المالية أو هوية الحركة.']);
        }

        $activeReference = array_key_exists('reference_number', $fields)
            ? self::normalizeReference($fields['reference_number'])
            : $this->active_reference;

        try {
            return DB::transaction(function () use ($actor, $fields, $reason, $activeReference): TransactionAmendment {
                $line = self::query()->lockForUpdate()->findOrFail($this->id);

                if (! $line->isAmendable(lockForUpdate: true)) {
                    throw ValidationException::withMessages(['details' => 'لا يمكن تعديل بيانات هذه الحركة.']);
                }

                self::ensureReferenceIsAvailable($activeReference, $line->id);

                $changes = [];
                $updates = [];

                foreach ($fields as $field => $value) {
                    $oldValue = $line->getAttribute($field);
                    $newValue = filled($value) ? trim((string) $value) : null;

                    if ((string) ($oldValue ?? '') === (string) ($newValue ?? '')) {
                        continue;
                    }

                    $changes[$field] = [$oldValue, $newValue];
                    $updates[$field] = $newValue;
                }

                if ($changes === []) {
                    throw ValidationException::withMessages(['details' => 'غيّر بيانًا واحدًا على الأقل قبل الحفظ.']);
                }

                if (array_key_exists('reference_number', $updates)) {
                    $updates['active_reference'] = $activeReference;
                }

                $line->update($updates);
                $amendment = $line->amendments()->create([
                    'user_id' => $actor->id,
                    'changes' => $changes,
                    'reason' => $reason,
                ]);
                $this->setRawAttributes($line->getAttributes(), true);

                return $amendment;
            });
        } catch (UniqueConstraintViolationException $exception) {
            self::throwReferenceConflictAfterUniqueViolation($activeReference, $exception, $this->id);
        }
    }

    public static function normalizeReference(mixed $reference): ?string
    {
        $normalized = Str::upper((string) preg_replace('/\s+/u', '', trim((string) $reference)));

        return $normalized !== '' ? $normalized : null;
    }

    public static function activeReferenceConflict(mixed $reference, ?int $ignoreTransactionId = null): ?self
    {
        $normalized = self::normalizeReference($reference);

        if ($normalized === null) {
            return null;
        }

        return self::query()
            ->where('active_reference', $normalized)
            ->when($ignoreTransactionId, fn (Builder $query): Builder => $query->whereKeyNot($ignoreTransactionId))
            ->with('subscriber')
            ->first();
    }

    private static function ensureReferenceIsAvailable(?string $activeReference, ?int $ignoreTransactionId = null): void
    {
        $conflict = self::activeReferenceConflict($activeReference, $ignoreTransactionId);

        if ($conflict) {
            throw self::referenceConflictException($conflict);
        }
    }

    private static function throwReferenceConflictAfterUniqueViolation(
        ?string $activeReference,
        UniqueConstraintViolationException $exception,
        ?int $ignoreTransactionId = null,
    ): never {
        $conflict = self::activeReferenceConflict($activeReference, $ignoreTransactionId);

        if ($conflict) {
            throw self::referenceConflictException($conflict);
        }

        throw $exception;
    }

    private static function referenceConflictException(self $conflict): ValidationException
    {
        return ValidationException::withMessages([
            'reference_number' => sprintf(
                'هذا الرقم المرجعي مسجَّل مسبقًا على دفعة أخرى — السند %s للمشترك %s.',
                $conflict->displayVoucherNumber() ?? '—',
                $conflict->subscriber->displayName(),
            ),
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

    /** The one voucher shown to users: paper/manual first, otherwise system-generated. */
    public function displayVoucherNumber(): ?string
    {
        return $this->manual_voucher_number ?: $this->printedVoucherNumber();
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
     * Whether a line may be corrected or deleted: a payment, discount,
     * clearing or charge recorded by hand that still stands. Weekly
     * readings, their standing discounts and the registration fee are
     * billed by their own flows.
     */
    public function isCorrectable(): bool
    {
        if ($this->isRegistrationFee()) {
            return false;
        }

        return ! $this->isCancelled() && in_array($this->type, self::correctableTypes(), true);
    }

    /**
     * Whether a line may be deleted (cancelled with a reversal): anything
     * that may be corrected, and also a weekly reading, its standing
     * discount or the registration fee, billed wrongly. Its source key is
     * kept, so the flow that billed it does not bill it again.
     */
    public function isCancellable(): bool
    {
        if ($this->isCancelled()) {
            return false;
        }

        return $this->isCorrectable() || in_array($this->type, [self::TYPE_METER_READING, self::TYPE_READING_DISCOUNT, self::TYPE_SUBSCRIPTION_FEE], true);
    }

    /** A standing payment whose descriptive details may still be amended. */
    public function isAmendable(bool $lockForUpdate = false): bool
    {
        return $this->isPayment()
            && ! $this->isCancelled()
            && ! $this->isInClosedDay($lockForUpdate);
    }

    /** Why a permitted user cannot amend this line right now. */
    public function amendmentUnavailableReason(): ?string
    {
        return match (true) {
            ! $this->isPayment() => 'متاح للدفعات فقط',
            $this->isCancelled() => 'الحركة ملغاة',
            $this->isInClosedDay() => 'بعد إغلاق اليوم',
            default => null,
        };
    }

    /** Whether this payment belongs to a submitted or approved daily closing. */
    public function isInClosedDay(bool $lockForUpdate = false): bool
    {
        if (! $lockForUpdate && $this->relationLoaded('closingLine')) {
            return $this->closingLine !== null
                && $this->closingLine->closing !== null
                && ! $this->closingLine->closing->status->isEditable();
        }

        return ClosingPayment::query()
            ->where('subscriber_transaction_id', $this->id)
            ->whereHas('closing', fn (Builder $query): Builder => $query->whereIn('status', [
                ClosingStatus::Submitted->value,
                ClosingStatus::Approved->value,
            ]))
            ->when($lockForUpdate, fn (Builder $query): Builder => $query->lockForUpdate())
            ->exists();
    }

    /**
     * Whether the line is the last one on the subscriber's statement, the
     * one at the bottom of the table (the statement lists oldest first).
     */
    public function isLastOnStatement(bool $lockForUpdate = false): bool
    {
        $lastGroupId = self::query()
            ->where('subscriber_id', $this->subscriber_id)
            ->whereNull('reverses_id')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->when($lockForUpdate, fn (Builder $query): Builder => $query->lockForUpdate())
            ->value('id');

        if ($lastGroupId === null) {
            return false;
        }

        return self::query()
            ->where('subscriber_id', $this->subscriber_id)
            ->where(fn (Builder $query): Builder => $query
                ->whereKey($lastGroupId)
                ->orWhere('reverses_id', $lastGroupId))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->when($lockForUpdate, fn (Builder $query): Builder => $query->lockForUpdate())
            ->value('id') === $this->id;
    }

    /**
     * Whether a line may be erased for good: only the last line of the
     * statement, and not one a closing has counted. When that is a
     * reversal, the cancelled line it reverses goes with it.
     */
    public function isErasable(bool $lockForUpdate = false): bool
    {
        $erased = $this->isReversal() ? $this->reverses : $this;

        return $this->isLastOnStatement($lockForUpdate)
            && ! ClosingPayment::query()
                ->where('subscriber_transaction_id', $erased?->id)
                ->when($lockForUpdate, fn (Builder $query): Builder => $query->lockForUpdate())
                ->exists();
    }

    /**
     * Erase the last line of the statement for good, leaving no trace on
     * the account. If it is a reversal, the line it reverses goes with it,
     * and if it was cancelled, so does its reversal, so the balance stays
     * consistent. The only record is a log entry.
     *
     * @throws ValidationException when it may not be erased (any more)
     */
    public function erase(User $actor, string $reason): void
    {
        DB::transaction(function () use ($actor, $reason): void {
            $line = self::query()->lockForUpdate()->findOrFail($this->id);

            if (! $line->isErasable(lockForUpdate: true)) {
                throw ValidationException::withMessages(['reason' => 'لا يمكن حذف هذه الحركة نهائيًا.']);
            }

            $target = $line->isReversal() ? $line->reverses : $line;
            $reversals = self::query()->where('reverses_id', $target->id)->get();
            $erasedTransactions = collect([$target])
                ->concat($reversals)
                ->map(fn (self $transaction): array => $transaction->getAttributes())
                ->all();

            self::query()->where('corrects_id', $target->id)->update(['corrects_id' => null]);
            $reversals->each->delete();
            $target->delete();

            Log::warning('Transaction erased for good', [
                'transactions' => $erasedTransactions,
                'erased_by' => $actor->only(['id', 'name', 'username']),
                'reason' => $reason,
            ]);
        });
    }

    /**
     * Whether this is the registration fee created by the subscriber flow,
     * rather than a subscription-fee charge entered by hand.
     */
    public function isRegistrationFee(): bool
    {
        return $this->type === self::TYPE_SUBSCRIPTION_FEE && ! str_starts_with($this->source_key, 'charge:');
    }

    /**
     * The types of line a user may correct or delete.
     *
     * @return array<int, string>
     */
    public static function correctableTypes(): array
    {
        return [self::TYPE_PAYMENT, self::TYPE_DISCOUNT, self::TYPE_CLEARING, ...array_map(fn (ChargeType $type): string => $type->value, ChargeType::cases())];
    }

    public function isPayment(): bool
    {
        return $this->type === self::TYPE_PAYMENT;
    }

    public function isClearing(): bool
    {
        return $this->type === self::TYPE_CLEARING;
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
     * Whether the line is in the subscriber's favour (له): a payment, a
     * discount or a clearing, or the reversal of a charge. Everything else
     * is a charge (عليه).
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
     * Only the charges (عليه) that count: readings, fees and penalties.
     */
    #[Scope]
    protected function charges(Builder $query): void
    {
        $query->counted()->whereNotIn($query->qualifyColumn('type'), [...self::CREDIT_TYPES, self::TYPE_REVERSAL]);
    }

    /**
     * Only the lines in the subscriber's favour (له) that count: payments,
     * discounts and clearings.
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
            self::TYPE_CLEARING => 'مقاصة مقابل خدمة للشركة',
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
            self::TYPE_CLEARING => 'مقاصة',
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

    public function amendments(): HasMany
    {
        return $this->hasMany(TransactionAmendment::class, 'transaction_id')->oldest('created_at')->orderBy('id');
    }

    public function closingLine(): HasOne
    {
        return $this->hasOne(ClosingPayment::class, 'subscriber_transaction_id');
    }
}
