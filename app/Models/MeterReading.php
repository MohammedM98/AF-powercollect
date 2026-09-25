<?php

namespace App\Models;

use App\Enums\MeterReadingStatus;
use App\Models\Concerns\BelongsToBranch;
use Carbon\CarbonInterface;
use Database\Factories\MeterReadingFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

#[Fillable([
    'subscriber_id', 'branch_id', 'week_start', 'week_end', 'previous_reading', 'current_reading',
    'consumption', 'unit_price', 'reading_fee', 'minimum_payment', 'amount_due', 'status', 'recorded_by', 'notes',
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

    public function isPending(): bool
    {
        return $this->status === MeterReadingStatus::Pending;
    }

    public function subscriber(): BelongsTo
    {
        return $this->belongsTo(Subscriber::class);
    }

    public function recordedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
