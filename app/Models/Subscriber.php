<?php

namespace App\Models;

use App\Enums\SubscriberStatus;
use App\Models\Concerns\BelongsToBranch;
use Database\Factories\SubscriberFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

#[Fillable([
    'full_name', 'national_id', 'phone', 'address', 'meter_box_id', 'tariff_id', 'tariff_segment_id', 'branch_id',
    'registered_by', 'status', 'circuit_breaker_id', 'minimum_charge', 'initial_reading', 'subscription_fee',
    'subscription_date', 'notes',
])]
class Subscriber extends Model
{
    /** @use HasFactory<SubscriberFactory> */
    use BelongsToBranch, HasFactory;

    /**
     * Every new subscriber gets an account number automatically; it is
     * never taken from user input.
     */
    protected static function booted(): void
    {
        static::creating(function (Subscriber $subscriber): void {
            $subscriber->account_number ??= static::nextAccountNumber();
        });
    }

    /**
     * The next account number for the current year: the four-digit year
     * followed by a five-digit sequence that restarts each year, e.g.
     * 202600001. Ordering by length first keeps the sequence correct if a
     * year ever passes 99,999 subscribers.
     */
    public static function nextAccountNumber(): string
    {
        $year = now()->format('Y');

        $lastAccountNumber = static::query()
            ->where('account_number', 'like', $year.'%')
            ->orderByRaw('LENGTH(account_number) DESC')
            ->orderByDesc('account_number')
            ->lockForUpdate()
            ->value('account_number');

        $nextSequence = $lastAccountNumber ? (int) substr($lastAccountNumber, 4) + 1 : 1;

        return $year.str_pad((string) $nextSequence, 5, '0', STR_PAD_LEFT);
    }

    protected function casts(): array
    {
        return [
            'status' => SubscriberStatus::class,
            'subscription_date' => 'date',
            'subscription_fee' => 'decimal:2',
            'initial_reading' => 'float',
        ];
    }

    public function meterBox(): BelongsTo
    {
        return $this->belongsTo(MeterBox::class);
    }

    public function tariff(): BelongsTo
    {
        return $this->belongsTo(Tariff::class);
    }

    public function tariffSegment(): BelongsTo
    {
        return $this->belongsTo(TariffSegment::class);
    }

    public function circuitBreaker(): BelongsTo
    {
        return $this->belongsTo(CircuitBreaker::class);
    }

    public function registeredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'registered_by');
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(SubscriberTransaction::class);
    }

    /**
     * The weekly minimum payment: the subscriber's own minimum charge, or
     * their circuit breaker's minimum payment if none is set.
     */
    public function weeklyMinimumPayment(): string
    {
        return (string) ($this->minimum_charge ?? $this->circuitBreaker?->minimum_payment ?? '0.00');
    }

    public function meterReadings(): HasMany
    {
        return $this->hasMany(MeterReading::class);
    }

    public function latestMeterReading(): HasOne
    {
        return $this->hasOne(MeterReading::class)->latestOfMany('week_start');
    }

    /**
     * The meter reading a new week starts from: the current reading of the
     * last week recorded before it, or the subscriber's initial reading if
     * this is their first week.
     */
    public function previousReadingBefore(Carbon $weekStart): float
    {
        $lastReading = $this->meterReadings()
            ->where('week_start', '<', $weekStart->toDateString())
            ->orderByDesc('week_start')
            ->value('current_reading');

        return (float) ($lastReading ?? $this->initial_reading ?? 0);
    }

    /**
     * Set the account's money not yet used (payments and discounts, oldest
     * first) against its charges not yet paid, oldest first, putting the
     * charges in `$firstChargeIds` before the rest. Every change to the
     * account runs this, so each payment's record shows what it paid for
     * and a subscriber has unpaid charges or unused credit, never both.
     *
     * @param  array<int, int|string>  $firstChargeIds
     */
    public function applyCredits(array $firstChargeIds = []): void
    {
        DB::transaction(function () use ($firstChargeIds): void {
            $lines = $this->transactions()
                ->with(['coveredCharges', 'coveringCredits'])
                ->oldest()
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            $unused = $lines->filter->isCredit()->map->openCents()->filter()->all();
            $unpaid = $lines->reject->isCredit()
                ->sortBy(fn (SubscriberTransaction $charge): int => in_array($charge->id, array_map('intval', $firstChargeIds), true) ? 0 : 1)
                ->map->openCents()
                ->filter(fn (int $owed): bool => $owed > 0)
                ->all();

            foreach ($unused as $creditId => $left) {
                foreach ($unpaid as $chargeId => $owed) {
                    if ($left === 0) {
                        break;
                    }

                    $taken = min($left, $owed);

                    if ($taken === 0) {
                        continue;
                    }

                    $lines[$creditId]->coveredCharges()->attach($chargeId, ['amount' => number_format($taken / 100, 2, '.', '')]);
                    $left -= $taken;
                    $unpaid[$chargeId] = $owed - $taken;
                }
            }
        });
    }

    /**
     * What the subscriber owes, in shekels: the sum of their account's
     * lines (negative when they are in credit).
     */
    public function balance(): float
    {
        return round((float) $this->transactions()->sum('amount'), 2);
    }
}
