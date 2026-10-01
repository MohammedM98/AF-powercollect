<?php

namespace App\Support;

use App\Models\ClosingSetting;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * The days, weeks and months closings cover, in the business's time zone,
 * as set on the closing schedule page. A business day closes at the
 * cut-off time: at midnight by default, or earlier in the evening, when
 * later payments count for the next day. A week starts on the chosen
 * weekday; a month is the calendar month. A week that spans two months is
 * split between them by date, never added whole.
 */
class ClosingPeriods
{
    /**
     * A business date (Y-m-d) at midnight, business time.
     */
    public static function date(CarbonInterface|string $date): CarbonImmutable
    {
        return CarbonImmutable::parse(
            $date instanceof CarbonInterface ? $date->toDateString() : $date,
            config('app.business_timezone'),
        )->startOfDay();
    }

    /**
     * The moment the business day closes, business time.
     */
    public static function dayEnd(CarbonInterface|string $day): CarbonImmutable
    {
        return self::date($day)->addMinutes(ClosingSetting::current()->cutoffMinutes());
    }

    /**
     * The UTC moments a business period starts at and ends before: from
     * the cut-off of the day before its first day to its last day's.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    public static function utcRange(CarbonInterface|string $first, CarbonInterface|string $last): array
    {
        return [self::dayEnd(self::date($first)->subDay())->utc(), self::dayEnd($last)->utc()];
    }

    /**
     * The business day a moment belongs to (Y-m-d): its calendar date, or
     * the next day once that date's cut-off has passed.
     */
    public static function dayOf(CarbonInterface|string $moment): string
    {
        $local = CarbonImmutable::parse($moment, 'UTC')->setTimezone(config('app.business_timezone'));
        $day = self::date($local->toDateString());

        return ($local->greaterThanOrEqualTo(self::dayEnd($day)) ? $day->addDay() : $day)->toDateString();
    }

    /**
     * The business day under way now.
     */
    public static function today(): CarbonImmutable
    {
        return self::date(self::dayOf(now()));
    }

    /**
     * The latest business day that has closed.
     */
    public static function latestEndedDay(): CarbonImmutable
    {
        return self::today()->subDay();
    }

    /**
     * Whether the business day (or the period ending on it) has closed.
     */
    public static function hasEnded(CarbonInterface|string $lastDay): bool
    {
        return now()->greaterThanOrEqualTo(self::dayEnd($lastDay));
    }

    /**
     * The first and last day of the week containing the date.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    public static function week(CarbonInterface|string $date): array
    {
        $start = self::date($date)->startOfWeek(ClosingSetting::current()->week_starts_on);

        return [$start, $start->addDays(6)];
    }

    /**
     * The first and last day of the calendar month containing the date.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    public static function month(CarbonInterface|string $date): array
    {
        $day = self::date($date);

        return [$day->startOfMonth(), $day->endOfMonth()->startOfDay()];
    }

    /**
     * Every date from the first to the last, as Y-m-d.
     *
     * @return array<int, string>
     */
    public static function days(CarbonInterface|string $first, CarbonInterface|string $last): array
    {
        $days = [];

        for ($day = self::date($first); $day->lessThanOrEqualTo(self::date($last)); $day = $day->addDay()) {
            $days[] = $day->toDateString();
        }

        return $days;
    }
}
