<?php

namespace App\Models;

use App\Enums\ReadingEntryMode;
use Carbon\CarbonInterface;
use Database\Factories\ReadingEntrySettingFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;

/**
 * The company-wide reading schedule: the weekly reading day, which ends each
 * reading week, and when data entry may record readings. When the reading day
 * moves, `reading_day_history` keeps the earlier days, oldest first, each with
 * the end of the last week read on it and the end of the first week on the
 * day that replaced it.
 */
#[Fillable(['open_days', 'reading_day', 'reading_day_history', 'mode', 'updated_by'])]
class ReadingEntrySetting extends Model
{
    /** @use HasFactory<ReadingEntrySettingFactory> */
    use HasFactory;

    /**
     * Meters are read on Thursday unless configured otherwise: a reading week
     * ends on the reading day and the next one starts the day after.
     */
    public const DEFAULT_READING_DAY = CarbonInterface::THURSDAY;

    /**
     * Reading entry opens on Thursday unless configured otherwise.
     */
    public const DEFAULT_OPEN_DAYS = [CarbonInterface::THURSDAY];

    protected static function booted(): void
    {
        // current() keeps the setting for the request; reload it once it changes.
        static::saved(fn () => app()->forgetInstance(self::class));
    }

    protected function casts(): array
    {
        return [
            'open_days' => 'array',
            'reading_day' => 'integer',
            'reading_day_history' => 'array',
            'mode' => ReadingEntryMode::class,
        ];
    }

    /**
     * The company-wide setting. Every reading-week calculation reads it, so
     * it is loaded once per request or job (see AppServiceProvider).
     */
    public static function current(): self
    {
        return app(self::class);
    }

    /**
     * Load the company-wide setting, creating it with the defaults on first use.
     */
    public static function loadCurrent(): self
    {
        return static::query()->oldest('id')->first()
            ?? static::create([
                'open_days' => self::DEFAULT_OPEN_DAYS,
                'reading_day' => self::DEFAULT_READING_DAY,
                'mode' => ReadingEntryMode::Automatic,
            ]);
    }

    /**
     * Whether data entry staff may record readings right now: forced open
     * or closed by the manual switch, otherwise open on the scheduled days
     * in the business's local timezone.
     */
    public function isOpen(?CarbonInterface $at = null): bool
    {
        return match ($this->mode) {
            ReadingEntryMode::Open => true,
            ReadingEntryMode::Closed => false,
            ReadingEntryMode::Automatic => in_array(
                ($at ?? now())->copy()->setTimezone(config('app.business_timezone'))->dayOfWeek,
                array_map('intval', $this->open_days ?? []),
                true,
            ),
        };
    }

    /**
     * Move the weekly reading day (not saved yet). Weeks that have already
     * ended keep the day they were read on. The first week on the new day
     * runs from the day after the latest of them to the new reading day
     * (today or the next one), so it can be shorter or longer than seven
     * days; after it, weeks run a full seven days again.
     */
    public function changeReadingDay(int $readingDay): void
    {
        if ($readingDay === $this->reading_day) {
            return;
        }

        $history = $this->reading_day_history ?? [];
        $lastWeekEnd = $this->weekEndFor($this->latestEndedWeekStart())->toDateString();

        // No week has ended on the current day yet: it never took effect, so
        // the change is made from the day before it instead.
        if ((Arr::last($history)['last_week_end'] ?? null) === $lastWeekEnd) {
            $this->reading_day = array_pop($history)['reading_day'];
        }

        if ($readingDay !== $this->reading_day) {
            $history[] = [
                'reading_day' => $this->reading_day,
                'last_week_end' => $lastWeekEnd,
                'next_week_end' => $this->businessToday()->endOfWeek($readingDay)->startOfDay()->toDateString(),
            ];
        }

        $this->reading_day = $readingDay;
        $this->reading_day_history = $history;
    }

    /**
     * For each reading day, the first week it would start if chosen now.
     *
     * @return array<int, array{start: string, end: string}>
     */
    public function firstWeekOnEachReadingDay(): array
    {
        $dayAfterLatestWeek = $this->weekEndFor($this->latestEndedWeekStart())->addDay();

        return collect(range(0, 6))
            ->mapWithKeys(function (int $readingDay) use ($dayAfterLatestWeek): array {
                $preview = $this->replicate();
                $preview->changeReadingDay($readingDay);

                return [$readingDay => [
                    'start' => $preview->weekStartFor($dayAfterLatestWeek)->toDateString(),
                    'end' => $preview->weekEndFor($dayAfterLatestWeek)->toDateString(),
                ]];
            })
            ->all();
    }

    /**
     * The first day of the reading week containing the given date.
     */
    public function weekStartFor(CarbonInterface $date): Carbon
    {
        return $this->weekContaining($date)[0];
    }

    /**
     * The reading day that ends the reading week containing the given date.
     */
    public function weekEndFor(CarbonInterface $date): Carbon
    {
        return $this->weekContaining($date)[1];
    }

    /**
     * The start of the latest week that has ended, counting today as its
     * last day if today is the reading day: readings taken on the reading
     * day, or any day after it before the next one, belong to that week.
     * "Today" is the business's local date.
     */
    public function latestEndedWeekStart(?CarbonInterface $at = null): Carbon
    {
        $today = $this->businessToday($at);
        [$weekStart, $weekEnd] = $this->weekContaining($today);

        return $weekEnd->equalTo($today) ? $weekStart : $this->weekStartFor($weekStart->subDay());
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * The first and last day of the reading week containing the given date,
     * on the reading day in force then.
     *
     * @return array{0: Carbon, 1: Carbon}
     */
    private function weekContaining(CarbonInterface $date): array
    {
        $day = Carbon::instance($date)->startOfDay();
        $readingDay = $this->reading_day;
        $previousChange = null;

        foreach ($this->reading_day_history ?? [] as $change) {
            if ($day->lte(Carbon::parse($change['last_week_end']))) {
                $readingDay = (int) $change['reading_day'];

                break;
            }

            $previousChange = $change;
        }

        if ($previousChange !== null && $day->lte(Carbon::parse($previousChange['next_week_end']))) {
            return [Carbon::parse($previousChange['last_week_end'])->addDay(), Carbon::parse($previousChange['next_week_end'])];
        }

        $weekEnd = $day->copy()->endOfWeek($readingDay)->startOfDay();

        return [$weekEnd->copy()->subDays(6), $weekEnd];
    }

    /**
     * The business's local date, at midnight.
     */
    private function businessToday(?CarbonInterface $at = null): Carbon
    {
        return Carbon::parse(Carbon::instance($at ?? now())->setTimezone(config('app.business_timezone'))->toDateString());
    }
}
