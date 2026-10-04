<?php

namespace App\Models;

use App\Enums\ChargeType;
use App\Enums\ClosingStatus;
use App\Enums\CorrectionReason;
use App\Enums\Currency;
use App\Enums\DiscountMethod;
use App\Enums\PaymentMethod;
use App\Enums\PermissionKey;
use App\Enums\TransactionAction;
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
    'branch_id',
    'recorded_by',
    'employee_id',
    'meter_reading_id',
    'reverses_id',
    'corrects_id',
    'reference_transaction_id',
    'type',
    'status',
    'source_key',
    'mobile_operation_id',
    'amount',
    'balance_after',
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

    /** A generic amount charged to the subscription. */
    public const TYPE_INVOICE = 'invoice';

    /** An adjustment in the subscriber's favour. */
    public const TYPE_CREDIT = 'credit';

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

    /** A reversal of an invoice-like transaction. */
    public const TYPE_CANCELLATION = 'cancellation';

    /** A full or partial reversal of a payment-like transaction. */
    public const TYPE_REFUND = 'refund';

    public const STATUS_ACTIVE = 'active';

    public const STATUS_CANCELLED = 'cancelled';

    public const STATUS_LINKED_CANCELLATION = 'linked_cancellation';

    /**
     * The lines in the subscriber's favour (له); every other type is a
     * charge (عليه).
     */
    public const CREDIT_TYPES = [self::TYPE_PAYMENT, self::TYPE_CREDIT, self::TYPE_DISCOUNT, self::TYPE_READING_DISCOUNT, self::TYPE_CLEARING];

    public const INVOICE_LIKE_TYPES = [
        self::TYPE_INVOICE,
        self::TYPE_METER_READING,
        self::TYPE_SUBSCRIPTION_FEE,
        'penalty',
        'disconnection_fee',
    ];

    public const PAYMENT_LIKE_TYPES = [
        self::TYPE_PAYMENT,
        self::TYPE_CREDIT,
        self::TYPE_DISCOUNT,
        self::TYPE_READING_DISCOUNT,
        self::TYPE_CLEARING,
    ];

    public const REVERSAL_TYPES = [self::TYPE_REVERSAL, self::TYPE_CANCELLATION, self::TYPE_REFUND];

    /** Payment details that may change without touching its financial meaning. */
    public const AMENDABLE_FIELDS = ['bank_name', 'sender_bank_name', 'sender_name', 'reference_number', 'notes'];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'balance_after' => 'decimal:2',
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

    protected static function booted(): void
    {
        static::creating(function (self $transaction): void {
            $transaction->status ??= self::STATUS_ACTIVE;
            $transaction->employee_id ??= $transaction->recorded_by;
            $transaction->reference_transaction_id ??= $transaction->reverses_id;
            $transaction->branch_id ??= $transaction->subscriber()->value('branch_id');

            if ($transaction->balance_after === null && $transaction->subscriber_id !== null) {
                $currentBalance = (float) self::query()
                    ->where('subscriber_id', $transaction->subscriber_id)
                    ->sum('amount');

                $transaction->balance_after = number_format($currentBalance + (float) $transaction->amount, 2, '.', '');
            }
        });
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
                'status' => self::STATUS_CANCELLED,
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

    /**
     * The canonical actions the current user may submit for this transaction.
     * Business rules and permissions are both decided on the server.
     *
     * @return array<int, string>
     */
    public function availableActions(User $actor, ?bool $isLast = null, ?bool $hasPayment = null, bool $lockForUpdate = false): array
    {
        if (! $actor->isSuperAdmin() && $this->subscriber->branch_id !== $actor->branch_id) {
            return [];
        }

        $isLast ??= $this->isLastTransaction($lockForUpdate);
        $hasPayment ??= $this->hasAppliedPayment($lockForUpdate);
        $businessActions = $this->businessAvailableActions($isLast, $hasPayment, $lockForUpdate);

        if (! $this->isAmendable($lockForUpdate)) {
            $businessActions = array_values(array_filter(
                $businessActions,
                fn (TransactionAction $action): bool => $action !== TransactionAction::EditMetadata,
            ));
        }

        if ($this->isPermanentDeletionLocked($lockForUpdate)) {
            $businessActions = array_values(array_filter(
                $businessActions,
                fn (TransactionAction $action): bool => ! $action->isPermanentDeletion(),
            ));
        }

        return collect(TransactionAction::ordered())
            ->filter(fn (TransactionAction $action): bool => in_array($action, $businessActions, true) && $this->actorMay($actor, $action))
            ->map(fn (TransactionAction $action): string => $action->value)
            ->values()
            ->all();
    }

    /**
     * Apply one of the five canonical actions after locking and validating
     * the transaction against a freshly computed available-actions list.
     *
     * @param  array<string, mixed>  $data
     */
    public function applyAction(User $actor, TransactionAction $action, array $data): ?self
    {
        return DB::transaction(function () use ($actor, $action, $data): ?self {
            $line = self::query()->with('subscriber')->lockForUpdate()->findOrFail($this->id);
            $isLast = $line->isLastTransaction(lockForUpdate: true);
            $hasPayment = $line->hasAppliedPayment(lockForUpdate: true);

            if (! in_array($action->value, $line->availableActions($actor, $isLast, $hasPayment, lockForUpdate: true), true)) {
                throw ValidationException::withMessages(['action' => 'هذا الإجراء غير مسموح لهذه الحركة.']);
            }

            $result = match ($action) {
                TransactionAction::Edit => $line->applyAmountEdit($actor, $data),
                TransactionAction::EditMetadata => $line->applyMetadataEdit($actor, $data),
                TransactionAction::Delete => $line->applyHardDelete($actor, $data),
                TransactionAction::DeleteReversal => $line->applyHardDelete($actor, $data),
                TransactionAction::DeleteTree => $line->applyTreeDelete($actor, $data),
                TransactionAction::Cancel => $line->applyCancellation($actor, $data),
                TransactionAction::Refund => $line->applyRefund($actor, $data),
            };

            $this->setRawAttributes($line->getAttributes(), true);

            return $result;
        });
    }

    /** @return array<int, TransactionAction> */
    private function businessAvailableActions(bool $isLast, bool $hasPayment, bool $lockForUpdate): array
    {
        $metadataActions = $this->isPayment() ? [TransactionAction::EditMetadata] : [];

        if ($this->currentStatus() !== self::STATUS_ACTIVE) {
            return ! $this->isBilledByReading() && $this->isFullyReversed($lockForUpdate) ? [TransactionAction::DeleteTree] : [];
        }

        if (in_array($this->type, self::INVOICE_LIKE_TYPES, true)) {
            return $isLast && ! $hasPayment
                ? [TransactionAction::Edit, ...$metadataActions, TransactionAction::Delete]
                : [...$metadataActions, TransactionAction::Cancel];
        }

        if ($this->isPayment()) {
            return $isLast
                ? [...$metadataActions, TransactionAction::Delete]
                : [...$metadataActions, TransactionAction::Refund];
        }

        if (in_array($this->type, self::PAYMENT_LIKE_TYPES, true)) {
            return $isLast ? [TransactionAction::Delete] : [TransactionAction::Cancel];
        }

        if (in_array($this->type, self::REVERSAL_TYPES, true)) {
            return $isLast ? [TransactionAction::DeleteReversal] : [];
        }

        return $metadataActions;
    }

    private function actorMay(User $actor, TransactionAction $action): bool
    {
        return match ($action) {
            TransactionAction::Edit, TransactionAction::EditMetadata => $actor->hasPermission(PermissionKey::CorrectTransactions),
            TransactionAction::Delete, TransactionAction::DeleteReversal, TransactionAction::DeleteTree => $actor->hasPermission(PermissionKey::DeleteTransactions)
                || $actor->hasPermission(PermissionKey::ForceDeleteTransactions),
            TransactionAction::Cancel, TransactionAction::Refund => $actor->hasPermission(PermissionKey::DeleteTransactions),
        };
    }

    private function currentStatus(): string
    {
        if ($this->status !== null) {
            return $this->status;
        }

        return $this->cancelled_at === null ? self::STATUS_ACTIVE : self::STATUS_CANCELLED;
    }

    public function isLastTransaction(bool $lockForUpdate = false): bool
    {
        return self::query()
            ->where('subscriber_id', $this->subscriber_id)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->when($lockForUpdate, fn (Builder $query): Builder => $query->lockForUpdate())
            ->value('id') === $this->id;
    }

    private function hasAppliedPayment(bool $lockForUpdate = false): bool
    {
        return self::query()
            ->where('reference_transaction_id', $this->id)
            ->whereIn('type', self::PAYMENT_LIKE_TYPES)
            ->when($lockForUpdate, fn (Builder $query): Builder => $query->lockForUpdate())
            ->exists();
    }

    private function isFullyReversed(bool $lockForUpdate = false): bool
    {
        $hasCorrection = ! $lockForUpdate && $this->relationLoaded('correction')
            ? $this->correction !== null
            : self::query()
                ->where('corrects_id', $this->id)
                ->when($lockForUpdate, fn (Builder $query): Builder => $query->lockForUpdate())
                ->exists();

        if ($hasCorrection) {
            return false;
        }

        $reversals = ! $lockForUpdate && $this->relationLoaded('linkedReversals')
            ? $this->linkedReversals->whereIn('type', self::REVERSAL_TYPES)
            : self::query()
                ->where('subscriber_id', $this->subscriber_id)
                ->where(fn (Builder $query): Builder => $query
                    ->where('reference_transaction_id', $this->id)
                    ->orWhere('reverses_id', $this->id))
                ->whereIn('type', self::REVERSAL_TYPES)
                ->when($lockForUpdate, fn (Builder $query): Builder => $query->lockForUpdate())
                ->get();

        return $reversals->isNotEmpty()
            && Closing::cents($this->amount) + $reversals->sum(fn (self $reversal): int => Closing::cents($reversal->amount)) === 0;
    }

    /**
     * Whether a reading billed this line. Its row must stay, even cancelled,
     * so its source key keeps the reading from billing it again.
     */
    private function isBilledByReading(): bool
    {
        return $this->meter_reading_id !== null;
    }

    private function isPermanentDeletionLocked(bool $lockForUpdate = false): bool
    {
        if (! $lockForUpdate) {
            if ($this->reference_transaction_id !== null && $this->relationLoaded('referenceTransaction')) {
                return $this->referenceTransaction?->isInClosedDay() ?? false;
            }

            if ($this->reverses_id !== null && $this->relationLoaded('reverses')) {
                return $this->reverses?->isInClosedDay() ?? false;
            }

            if ($this->relationLoaded('closingLine')) {
                return $this->isInClosedDay();
            }
        }

        $originalId = $this->reference_transaction_id ?? $this->reverses_id ?? $this->id;

        return ClosingPayment::query()
            ->where('subscriber_transaction_id', $originalId)
            ->whereHas('closing', fn (Builder $query): Builder => $query->whereIn('status', [
                ClosingStatus::Submitted->value,
                ClosingStatus::Approved->value,
            ]))
            ->when($lockForUpdate, fn (Builder $query): Builder => $query->lockForUpdate())
            ->exists();
    }

    /** @param array<string, mixed> $data */
    private function applyAmountEdit(User $actor, array $data): self
    {
        $oldAmount = $this->amount;
        $amount = number_format((float) $data['amount'], 2, '.', '');
        $balanceBefore = (float) self::query()
            ->where('subscriber_id', $this->subscriber_id)
            ->whereKeyNot($this->id)
            ->sum('amount');

        $this->update([
            'amount' => $amount,
            'currency_amount' => $this->currency_amount === null ? null : $amount,
            'balance_after' => number_format($balanceBefore + (float) $amount, 2, '.', ''),
        ]);
        $this->amendments()->create([
            'user_id' => $actor->id,
            'changes' => ['amount' => [$oldAmount, $amount]],
            'reason' => trim((string) $data['amendment_reason']),
        ]);

        return $this;
    }

    /** @param array<string, mixed> $data */
    private function applyMetadataEdit(User $actor, array $data): self
    {
        $fields = array_intersect_key($data, array_flip(self::AMENDABLE_FIELDS));
        $activeReference = array_key_exists('reference_number', $fields)
            ? self::normalizeReference($fields['reference_number'])
            : $this->active_reference;
        self::ensureReferenceIsAvailable($activeReference, $this->id);

        $changes = [];
        $updates = [];

        foreach ($fields as $field => $value) {
            $oldValue = $this->getAttribute($field);
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

        $this->update($updates);
        $this->amendments()->create([
            'user_id' => $actor->id,
            'changes' => $changes,
            'reason' => filled($data['amendment_reason'] ?? null) ? trim((string) $data['amendment_reason']) : 'تعديل بيانات الحركة',
        ]);

        return $this;
    }

    /** @param array<string, mixed> $data */
    private function applyHardDelete(User $actor, array $data): ?self
    {
        $originalId = $this->reference_transaction_id ?? $this->reverses_id;
        $original = $originalId === null ? null : self::query()->lockForUpdate()->find($originalId);

        if ($original !== null) {
            $updates = [
                'status' => self::STATUS_ACTIVE,
                'cancelled_at' => null,
                'cancelled_by' => null,
                'cancellation_reason' => null,
                'cancellation_notes' => null,
            ];

            if ($original->isPayment() && $original->reference_number !== null) {
                self::ensureReferenceIsAvailable(self::normalizeReference($original->reference_number), $original->id);
                $updates['active_reference'] = self::normalizeReference($original->reference_number);
            }

            $original->update($updates);
        }

        $action = $this->isReversal() ? TransactionAction::DeleteReversal->value : TransactionAction::Delete->value;

        self::releaseEditableClosingLines([$this->id]);
        $this->delete();
        self::recalculateBalances($this->subscriber_id);
        TransactionDeletion::record($actor, $action, $data['correction_notes'] ?? null, [$this->getAttributes()]);

        Log::warning('Transaction hard deleted under ledger golden rule', [
            'action' => $action,
            'transaction' => $this->getAttributes(),
            'deleted_by' => $actor->only(['id', 'name', 'username']),
            'reason' => $data['correction_notes'] ?? null,
        ]);

        return null;
    }

    /** @param array<string, mixed> $data */
    private function applyTreeDelete(User $actor, array $data): ?self
    {
        $reversals = self::query()
            ->where('subscriber_id', $this->subscriber_id)
            ->where(fn (Builder $query): Builder => $query
                ->where('reference_transaction_id', $this->id)
                ->orWhere('reverses_id', $this->id))
            ->whereIn('type', self::REVERSAL_TYPES)
            ->lockForUpdate()
            ->get();
        $deletedTransactions = collect([$this])
            ->concat($reversals)
            ->map(fn (self $transaction): array => $transaction->getAttributes())
            ->all();

        self::query()->where('corrects_id', $this->id)->update(['corrects_id' => null]);
        self::releaseEditableClosingLines([$this->id, ...$reversals->modelKeys()]);
        $reversals->each->delete();
        $this->delete();
        self::recalculateBalances($this->subscriber_id);
        TransactionDeletion::record($actor, TransactionAction::DeleteTree->value, $data['correction_notes'] ?? null, $deletedTransactions);

        Log::warning('Transaction tree hard deleted under ledger golden rule', [
            'action' => TransactionAction::DeleteTree->value,
            'transactions' => $deletedTransactions,
            'deleted_by' => $actor->only(['id', 'name', 'username']),
            'reason' => $data['correction_notes'] ?? null,
        ]);

        return null;
    }

    /**
     * Take deleted transactions off any draft or returned closing, as
     * syncPayments() would; a submitted or approved one blocks deletion.
     *
     * @param  array<int, int>  $transactionIds
     */
    private static function releaseEditableClosingLines(array $transactionIds): void
    {
        ClosingPayment::query()
            ->whereIn('subscriber_transaction_id', $transactionIds)
            ->whereHas('closing', fn (Builder $query): Builder => $query->whereIn('status', [
                ClosingStatus::Draft->value,
                ClosingStatus::Returned->value,
            ]))
            ->delete();
    }

    private static function recalculateBalances(int $subscriberId): void
    {
        $balanceInCents = 0;
        $transactions = self::query()
            ->where('subscriber_id', $subscriberId)
            ->oldest('created_at')
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        foreach ($transactions as $transaction) {
            $balanceInCents += Closing::cents($transaction->amount);
            $transaction->updateQuietly(['balance_after' => Closing::money($balanceInCents)]);
        }
    }

    /** @param array<string, mixed> $data */
    private function applyCancellation(User $actor, array $data): self
    {
        $reason = CorrectionReason::tryFrom((string) ($data['correction_reason'] ?? '')) ?? CorrectionReason::Other;

        $this->update([
            'status' => self::STATUS_CANCELLED,
            'cancelled_at' => now(),
            'cancelled_by' => $actor->id,
            'cancellation_reason' => $reason,
            'cancellation_notes' => $data['correction_notes'] ?? null,
            'active_reference' => null,
        ]);

        return $this->subscriber->transactions()->create([
            'recorded_by' => $actor->id,
            'reverses_id' => $this->id,
            'reference_transaction_id' => $this->id,
            'type' => self::TYPE_CANCELLATION,
            'status' => self::STATUS_ACTIVE,
            'source_key' => 'cancellation:'.$this->id.':'.Str::ulid(),
            'amount' => number_format(-(float) $this->amount, 2, '.', ''),
            'currency' => $this->currency,
            'currency_amount' => $this->currency_amount,
            'exchange_rate' => $this->exchange_rate,
            'payment_method' => $this->payment_method,
        ]);
    }

    /** @param array<string, mixed> $data */
    private function applyRefund(User $actor, array $data): self
    {
        $refunded = self::query()
            ->where('reference_transaction_id', $this->id)
            ->where('type', self::TYPE_REFUND)
            ->lockForUpdate()
            ->get()
            ->sum(fn (self $refund): float => abs((float) $refund->amount));
        $remaining = round(abs((float) $this->amount) - $refunded, 2);
        $amount = round((float) $data['amount'], 2);

        if ($amount > $remaining) {
            throw ValidationException::withMessages(['amount' => 'مبلغ الإرجاع أكبر من المبلغ المتبقي للحركة.']);
        }

        $refund = $this->subscriber->transactions()->create([
            'recorded_by' => $actor->id,
            'reverses_id' => $this->id,
            'reference_transaction_id' => $this->id,
            'type' => self::TYPE_REFUND,
            'status' => self::STATUS_ACTIVE,
            'source_key' => 'refund:'.$this->id.':'.Str::ulid(),
            'amount' => number_format($amount, 2, '.', ''),
            'currency' => $this->currency,
            'currency_amount' => number_format($amount / max((float) $this->exchange_rate, 1), 2, '.', ''),
            'exchange_rate' => $this->exchange_rate,
            'payment_method' => $this->payment_method,
        ]);

        if ($amount >= $remaining) {
            $this->update([
                'status' => self::STATUS_LINKED_CANCELLATION,
                'cancelled_at' => now(),
                'cancelled_by' => $actor->id,
                'cancellation_reason' => CorrectionReason::PaymentRefunded,
                'cancellation_notes' => $data['correction_notes'] ?? null,
                'active_reference' => null,
            ]);
        }

        return $refund;
    }

    public function isCancelled(): bool
    {
        return $this->currentStatus() !== self::STATUS_ACTIVE || $this->cancelled_at !== null;
    }

    public function isReversal(): bool
    {
        return in_array($this->type, self::REVERSAL_TYPES, true);
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
     * consistent. The only record is the audit log's (TransactionDeletion)
     * and a log entry.
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
            TransactionDeletion::record($actor, TransactionDeletion::ACTION_ERASE, $reason, $erasedTransactions);

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
            self::TYPE_INVOICE => 'فاتورة',
            self::TYPE_CREDIT => 'رصيد دائن',
            self::TYPE_READING_DISCOUNT => implode(' · ', array_filter([
                'خصم دائم',
                match ($this->discount_method) {
                    DiscountMethod::Percentage => 'نسبة '.self::formatAmount($this->discount_value).'%',
                    DiscountMethod::Kilowatt => self::formatAmount($this->discount_value).' كيلو مجاني',
                    default => self::formatAmount($this->discount_value).' شيكل من سعر الكيلو',
                },
                $this->readingDiscountSegment(),
            ])),
            self::TYPE_REVERSAL, self::TYPE_CANCELLATION => $this->referenceTransaction
                ? 'إلغاء: '.$this->referenceTransaction->description().($this->referenceTransaction->voucher_number ? ' · سند '.$this->referenceTransaction->printedVoucherNumber() : '')
                : 'قيد عكسي',
            self::TYPE_REFUND => $this->referenceTransaction
                ? 'إرجاع: '.$this->referenceTransaction->description().($this->referenceTransaction->voucher_number ? ' · سند '.$this->referenceTransaction->printedVoucherNumber() : '')
                : 'إرجاع دفعة',
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
            self::TYPE_INVOICE => 'فاتورة',
            self::TYPE_METER_READING => 'قراءة أسبوعية',
            self::TYPE_SUBSCRIPTION_FEE => 'رسوم اشتراك',
            ...collect(ChargeType::cases())->mapWithKeys(fn (ChargeType $type) => [$type->value => __($type->label())])->all(),
            self::TYPE_PAYMENT => 'دفعة',
            self::TYPE_CREDIT => 'رصيد دائن',
            self::TYPE_DISCOUNT => 'خصم',
            self::TYPE_READING_DISCOUNT => 'خصم دائم',
            self::TYPE_CLEARING => 'مقاصة',
            self::TYPE_REVERSAL => 'قيد عكسي',
            self::TYPE_CANCELLATION => 'إلغاء',
            self::TYPE_REFUND => 'إرجاع',
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

    /** The original transaction referenced by a cancellation or refund. */
    public function referenceTransaction(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reference_transaction_id');
    }

    /** Cancellation and refund rows that point back to this transaction. */
    public function linkedReversals(): HasMany
    {
        return $this->hasMany(self::class, 'reference_transaction_id')->oldest('created_at')->orderBy('id');
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
