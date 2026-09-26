<?php

namespace App\Models;

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
    'consumption', 'unit_price', 'reading_fee', 'minimum_payment', 'amount_due', 'status', 'recorded_by', 'notes',
    'approved_by', 'approved_at',
])]
class MeterReading extends Model
{
    /** @use HasFactory<MeterReadingFactory> */
    use BelongsToBranch, HasFactory;

    /**
     * Reading weeks run Friday → Thursday.
     */
    public const WEEK_STARTS_ON = CarbonInterface::FRIDAY;

    protected function casts(): array
    {
        return [
            'week_start' => 'date',
            'week_end' => 'date',
            'status' => MeterReadingStatus::class,
            'unit_price' => 'decimal:2',
            'reading_fee' => 'decimal:2',
            'minimum_payment' => 'decimal:2',
            'amount_due' => 'decimal:2',
            'approved_at' => 'datetime',
        ];
    }

    /**
     * The Friday that starts the reading week containing the given date.
     */
    public static function weekStartFor(CarbonInterface $date): Carbon
    {
        return Carbon::instance($date)->startOfWeek(self::WEEK_STARTS_ON)->startOfDay();
    }

    /**
     * The start of the latest week that has ended, counting today as its
     * last day if today is Thursday: readings taken on Thursday — or any
     * day after it before the next Thursday — belong to that week. "Today"
     * is the business's local date.
     */
    public static function latestEndedWeekStart(?CarbonInterface $at = null): Carbon
    {
        $today = Carbon::instance($at ?? now())->setTimezone(config('app.business_timezone'))->toDateString();

        return self::weekStartFor(Carbon::parse($today)->subDays(6));
    }

    /**
     * The latest ended week and the ones before it, newest first, as
     * select options.
     *
     * @return array<int, array{value: string, label: string}>
     */
    public static function recentWeekOptions(int $count = 8): array
    {
        $latestWeekStart = self::latestEndedWeekStart();

        return collect(range(0, $count - 1))
            ->map(function (int $weeksAgo) use ($latestWeekStart) {
                $weekStart = $latestWeekStart->copy()->subWeeks($weeksAgo);

                return [
                    'value' => $weekStart->toDateString(),
                    'label' => 'الأسبوع المنتهي في الخميس '.$weekStart->copy()->addDays(6)->format('d-m-Y'),
                ];
            })
            ->all();
    }

    /**
     * What a week's consumption costs: consumption × kilowatt price, but
     * never less than the minimum payment.
     *
     * @return array{reading_fee: string, amount_due: string}
     */
    public static function chargesFor(int $consumption, float|string $unitPrice, float|string $minimumPayment): array
    {
        $readingFee = round($consumption * (float) $unitPrice, 2);

        return [
            'reading_fee' => number_format($readingFee, 2, '.', ''),
            'amount_due' => number_format(max($readingFee, (float) $minimumPayment), 2, '.', ''),
        ];
    }

    /**
     * The subscriber's current kilo price and weekly minimum. A reading
     * follows them until it is approved; from then on its prices are fixed.
     *
     * @return array{unit_price: string, minimum_payment: string}
     */
    public static function currentPricesFor(Subscriber $subscriber): array
    {
        return [
            'unit_price' => (string) $subscriber->tariff->rate,
            'minimum_payment' => $subscriber->weeklyMinimumPayment(),
        ];
    }

    /**
     * Re-price the subscriber's readings still waiting for approval at
     * their current kilo price and minimum, after either changed.
     */
    public static function repricePendingFor(Subscriber $subscriber): void
    {
        $prices = self::currentPricesFor($subscriber->load(['tariff', 'circuitBreaker']));

        $subscriber->meterReadings()
            ->where('status', MeterReadingStatus::Pending)
            ->each(fn (self $reading) => $reading->update([
                ...$prices,
                ...self::chargesFor($reading->consumption, $prices['unit_price'], $prices['minimum_payment']),
            ]));
    }

    public function isPending(): bool
    {
        return $this->status === MeterReadingStatus::Pending;
    }

    /**
     * Approve the reading: it is locked from then on, and its amount is
     * charged to the subscriber's transactions. A reading that is already
     * approved is left as it is.
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

            $reading->subscriber->transactions()->create([
                'recorded_by' => $approver->id,
                'meter_reading_id' => $reading->id,
                'type' => SubscriberTransaction::TYPE_METER_READING,
                'source_key' => $reading->chargeSourceKey(),
                'amount' => $reading->amount_due,
                'currency_amount' => $reading->amount_due,
            ]);

            $this->setRawAttributes($reading->getAttributes(), true);
        });
    }

    /**
     * Correct the reading and recalculate its charges at the subscriber's
     * current prices. An approved reading goes back to review: its charge is
     * taken off the subscriber's transactions until it is approved again.
     * Returns whether that happened.
     */
    public function correct(int $currentReading, ?string $notes): bool
    {
        return DB::transaction(function () use ($currentReading, $notes): bool {
            $wasApproved = ! $this->isPending();
            $consumption = $currentReading - $this->previous_reading;
            $prices = self::currentPricesFor($this->subscriber->load(['tariff', 'circuitBreaker']));

            if ($wasApproved) {
                SubscriberTransaction::where('source_key', $this->chargeSourceKey())->delete();
            }

            $this->update([
                'current_reading' => $currentReading,
                'consumption' => $consumption,
                ...$prices,
                ...self::chargesFor($consumption, $prices['unit_price'], $prices['minimum_payment']),
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
