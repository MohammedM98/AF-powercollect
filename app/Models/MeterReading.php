<?php

namespace App\Models;

use App\Enums\CorrectionReason;
use App\Enums\DiscountMethod;
use App\Enums\MeterReadingStatus;
use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Models\Concerns\BelongsToBranch;
use Carbon\CarbonInterface;
use Database\Factories\MeterReadingFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

#[Fillable([
    'subscriber_id', 'branch_id', 'week_start', 'week_end', 'previous_reading', 'current_reading',
    'consumption', 'unit_price', 'reading_fee', 'minimum_payment', 'discount_method', 'discount_value', 'discount_segment', 'discount_amount',
    'amount_due', 'status', 'recorded_by', 'notes', 'approved_by', 'approved_at', 'mobile_operation_id',
])]
class MeterReading extends Model
{
    /** @use HasFactory<MeterReadingFactory> */
    use BelongsToBranch, HasFactory;

    protected function casts(): array
    {
        return [
            'week_start' => 'date',
            'week_end' => 'date',
            'previous_reading' => 'float',
            'current_reading' => 'float',
            'consumption' => 'float',
            'status' => MeterReadingStatus::class,
            'unit_price' => 'decimal:2',
            'reading_fee' => 'decimal:2',
            'minimum_payment' => 'decimal:2',
            'discount_method' => DiscountMethod::class,
            'discount_value' => 'decimal:2',
            'discount_amount' => 'decimal:2',
            'amount_due' => 'decimal:2',
            'approved_at' => 'datetime',
        ];
    }

    /**
     * The first day of the reading week containing the given date. Weeks end
     * on the company's reading day (Thursday unless changed in the reading
     * schedule settings) and start the day after the previous one.
     */
    public static function weekStartFor(CarbonInterface $date): Carbon
    {
        return ReadingEntrySetting::current()->weekStartFor($date);
    }

    /**
     * The reading day that ends the reading week containing the given date.
     */
    public static function weekEndFor(CarbonInterface $date): Carbon
    {
        return ReadingEntrySetting::current()->weekEndFor($date);
    }

    /**
     * The start of the latest week that has ended, counting today as its
     * last day if today is the reading day. "Today" is the business's local
     * date.
     */
    public static function latestEndedWeekStart(?CarbonInterface $at = null): Carbon
    {
        return ReadingEntrySetting::current()->latestEndedWeekStart($at);
    }

    /**
     * The latest ended week and the ones before it, newest first, as
     * select options. Weeks read on an earlier reading day keep their dates.
     *
     * @return array<int, array{value: string, label: string}>
     */
    public static function recentWeekOptions(int $count = 8): array
    {
        $weekStart = self::latestEndedWeekStart();
        $options = [];

        while (count($options) < $count) {
            $weekEnd = self::weekEndFor($weekStart);
            $options[] = [
                'value' => $weekStart->toDateString(),
                'label' => 'الأسبوع المنتهي في '.$weekEnd->locale('ar')->dayName.' '.$weekEnd->format('d-m-Y'),
            ];
            $weekStart = self::weekStartFor($weekStart->copy()->subDay());
        }

        return $options;
    }

    /**
     * The kWh used between two meter readings, rounded to the two decimal
     * places readings are kept to.
     */
    public static function consumptionBetween(float $previousReading, float $currentReading): float
    {
        return round($currentReading - $previousReading, 2);
    }

    /**
     * What a standing discount takes off a week's reading fee, in shekels:
     * a percentage of the fee, kilowatts of the consumption at the kilo
     * price, or shekels off the price of each kilo — never more than the fee.
     */
    public static function discountFor(DiscountMethod $method, float|string $value, float $consumption, float|string $unitPrice): float
    {
        $readingFee = round($consumption * (float) $unitPrice, 2);

        $discount = match ($method) {
            DiscountMethod::Percentage => $readingFee * (float) $value / 100,
            DiscountMethod::Kilowatt => min((float) $value, $consumption) * (float) $unitPrice,
            DiscountMethod::Shekel => $consumption * min((float) $value, (float) $unitPrice),
        };

        return min(round($discount, 2), $readingFee);
    }

    /**
     * What a week's consumption costs: consumption × kilowatt price, but
     * never less than the minimum payment. A subscriber with a standing
     * discount pays the fee less the discount instead, with no minimum:
     * only the kilos the discount leaves are paid for. `discount_amount`
     * is what the discount took off the week's bill.
     *
     * @return array{reading_fee: string, discount_amount: string, amount_due: string}
     */
    public static function chargesFor(
        float $consumption,
        float|string $unitPrice,
        float|string $minimumPayment,
        ?DiscountMethod $discountMethod = null,
        float|string|null $discountValue = null,
    ): array {
        $readingFee = round($consumption * (float) $unitPrice, 2);
        $hasDiscount = $discountMethod !== null && $discountValue !== null;
        $discount = $hasDiscount ? self::discountFor($discountMethod, $discountValue, $consumption, $unitPrice) : 0.0;
        $amountDue = $hasDiscount ? round($readingFee - $discount, 2) : max($readingFee, (float) $minimumPayment);

        return [
            'reading_fee' => number_format($readingFee, 2, '.', ''),
            'discount_amount' => number_format($discount, 2, '.', ''),
            'amount_due' => number_format($amountDue, 2, '.', ''),
        ];
    }

    public function isPending(): bool
    {
        return $this->status === MeterReadingStatus::Pending;
    }

    /**
     * Approve the reading: it is locked from then on, and its amount is
     * charged to the subscriber's transactions — the week's full bill, with
     * its standing discount beside it as a line of its own (خصم القراءات الأسبوعية). A
     * reading that is already approved is left as it is.
     */
    public function approve(User $approver): void
    {
        DB::transaction(function () use ($approver): void {
            $reading = self::query()->lockForUpdate()->findOrFail($this->id);

            if (! $reading->isPending()) {
                return;
            }

            $reading->update([
                'status' => MeterReadingStatus::Approved,
                'approved_by' => $approver->id,
                'approved_at' => now(),
            ]);

            $reading->recordChargeLine($approver);
            $reading->recordDiscountLine($approver);

            $this->setRawAttributes($reading->getAttributes(), true);
        });
    }

    /**
     * Bill the reading with the subscriber's standing discount as it is now
     * (none when it was stopped), at the prices the reading was recorded
     * with. An approved reading's lines are rebilled to match — the old ones
     * cancelled with a reversal, kept on the statement, and the new ones
     * recorded under them — so the subscriber's transactions show the change
     * straight away; a pending one's shows when it is approved.
     */
    public function applyStandingDiscount(?StandingDiscount $discount, User $recorder): void
    {
        DB::transaction(function () use ($discount, $recorder): void {
            $reading = self::query()->lockForUpdate()->findOrFail($this->id);

            $reading->update([
                'discount_method' => $discount?->method,
                'discount_value' => $discount?->value,
                'discount_segment' => $discount?->segment,
                ...self::chargesFor($reading->consumption, $reading->unit_price, $reading->minimum_payment, $discount?->method, $discount?->value),
            ]);

            if (! $reading->isPending()) {
                $charge = $reading->currentLine(SubscriberTransaction::TYPE_METER_READING);
                $discountLine = $reading->currentLine(SubscriberTransaction::TYPE_READING_DISCOUNT);
                $chargeNeedsRebilling = $charge && $charge->amount !== $reading->amountBeforeDiscount();

                if ($chargeNeedsRebilling) {
                    $charge->cancelForReading($recorder, CorrectionReason::StandingDiscountChanged);
                }

                $discountLine?->cancelForReading($recorder, CorrectionReason::StandingDiscountChanged);

                if ($chargeNeedsRebilling) {
                    $reading->recordChargeLine($recorder);
                }

                $reading->recordDiscountLine($recorder);
            }

            $this->setRawAttributes($reading->getAttributes(), true);
        });
    }

    /**
     * Charge the reading's week to the subscriber's account: the full bill,
     * before its standing discount.
     */
    private function recordChargeLine(User $recorder): void
    {
        if ($this->sourceWasBilled($this->chargeSourceKey())) {
            return;
        }

        $this->subscriber->transactions()->create([
            'recorded_by' => $recorder->id,
            'meter_reading_id' => $this->id,
            'corrects_id' => $this->lastCancelledLineId(SubscriberTransaction::TYPE_METER_READING),
            'type' => SubscriberTransaction::TYPE_METER_READING,
            'source_key' => $this->chargeSourceKey(),
            'amount' => $this->amountBeforeDiscount(),
            'currency_amount' => $this->amountBeforeDiscount(),
        ]);
    }

    /**
     * Take the reading's standing discount off the subscriber's account as
     * a line of its own (خصم القراءات الأسبوعية) beside the reading's charge, naming the
     * customer segment it was given to in its details; a reading billed
     * without one takes nothing off.
     */
    private function recordDiscountLine(User $recorder): void
    {
        if ((float) $this->discount_amount <= 0 || $this->sourceWasBilled($this->discountSourceKey())) {
            return;
        }

        $this->subscriber->transactions()->create([
            'recorded_by' => $recorder->id,
            'meter_reading_id' => $this->id,
            'corrects_id' => $this->lastCancelledLineId(SubscriberTransaction::TYPE_READING_DISCOUNT),
            'type' => SubscriberTransaction::TYPE_READING_DISCOUNT,
            'source_key' => $this->discountSourceKey(),
            'amount' => number_format(-(float) $this->discount_amount, 2, '.', ''),
            'currency_amount' => $this->discount_amount,
            'discount_method' => $this->discount_method,
            'discount_value' => $this->discount_value,
            'notes' => $this->discount_segment,
        ]);
    }

    /**
     * A line deleted by hand keeps its source key so this reading can never
     * bill that component again. Automatic reading corrections free the key
     * before recording their replacement.
     */
    private function sourceWasBilled(string $sourceKey): bool
    {
        return SubscriberTransaction::query()->where('source_key', $sourceKey)->exists();
    }

    /**
     * The reading's charge or standing-discount line that stands on the
     * subscriber's account, if it has been billed.
     */
    private function currentLine(string $type): ?SubscriberTransaction
    {
        return SubscriberTransaction::query()
            ->where('meter_reading_id', $this->id)
            ->where('type', $type)
            ->whereNull('cancelled_at')
            ->first();
    }

    /**
     * The reading's last cancelled line of the given type that nothing has
     * replaced yet, which the line billed next corrects.
     */
    private function lastCancelledLineId(string $type): ?int
    {
        return SubscriberTransaction::query()
            ->where('meter_reading_id', $this->id)
            ->where('type', $type)
            ->whereNotNull('cancelled_at')
            ->whereDoesntHave('correction')
            ->latest('id')
            ->value('id');
    }

    /**
     * Correct the reading and recalculate its charges at the prices and
     * standing discount captured when it was recorded. An approved reading
     * goes back to review: its charge and discount lines are cancelled with
     * a reversal — kept on the statement — until it is approved again, when
     * the new lines are recorded under them. Returns whether that happened.
     */
    public function correct(float $currentReading, ?string $notes, User $editor): bool
    {
        return DB::transaction(function () use ($currentReading, $notes, $editor): bool {
            $wasApproved = ! $this->isPending();
            $consumption = self::consumptionBetween($this->previous_reading, $currentReading);

            if ($wasApproved) {
                foreach ([SubscriberTransaction::TYPE_METER_READING, SubscriberTransaction::TYPE_READING_DISCOUNT] as $type) {
                    $this->currentLine($type)?->cancelForReading($editor, CorrectionReason::ReadingCorrected);
                }
            }

            $this->update([
                'current_reading' => $currentReading,
                'consumption' => $consumption,
                ...self::chargesFor($consumption, $this->unit_price, $this->minimum_payment, $this->discount_method, $this->discount_value),
                'notes' => $notes,
                ...($wasApproved ? ['status' => MeterReadingStatus::Pending, 'approved_by' => null, 'approved_at' => null] : []),
            ]);

            return $wasApproved;
        });
    }

    /**
     * The active users who may approve this reading: those holding the
     * permission in its branch, and every Super Admin.
     *
     * @return Collection<int, User>
     */
    public function approvers(): Collection
    {
        return User::query()
            ->where('is_active', true)
            ->where(fn (Builder $query) => $query
                ->where('role', UserRole::SuperAdmin)
                ->orWhere(fn (Builder $inBranch) => $inBranch
                    ->where('branch_id', $this->branch_id)
                    ->whereHas('permissions', fn (Builder $permission) => $permission->where('key', PermissionKey::ApproveMeterReadings->value))))
            ->get();
    }

    /**
     * The key of the transaction that charges this reading once approved.
     */
    public function chargeSourceKey(): string
    {
        return 'meter-reading:'.$this->id;
    }

    /**
     * The key of the transaction that takes this reading's standing
     * discount off once it is approved.
     */
    public function discountSourceKey(): string
    {
        return 'meter-reading-discount:'.$this->id;
    }

    /**
     * The week's bill before its standing discount: the reading fee, or
     * the minimum payment when that is more.
     */
    public function amountBeforeDiscount(): string
    {
        return number_format((float) $this->amount_due + (float) $this->discount_amount, 2, '.', '');
    }

    public function subscriber(): BelongsTo
    {
        return $this->belongsTo(Subscriber::class);
    }

    public function recordedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
