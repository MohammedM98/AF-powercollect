<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * The days, weeks and months closings cover, in the business's time zone.
 * A day runs from midnight to midnight business time; a week starts on the
 * configured weekday; a month is the calendar month. A week that spans two
 * months is split between them by date, never added whole.
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
     * The UTC moments a business period starts at and ends before.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    public static function utcRange(CarbonInterface|string $first, CarbonInterface|string $last): array
    {
        return [self::date($first)->utc(), self::date($last)->addDay()->utc()];
    }

    /**
     * The latest business day that has ended: yesterday.
     */
    public static function latestEndedDay(): CarbonImmutable
    {
        return DailySeries::today()->subDay();
    }

    /**
     * Whether the business day (or the period ending on it) is over.
     */
    public static function hasEnded(CarbonInterface|string $lastDay): bool
    {
        return self::date($lastDay)->lessThan(DailySeries::today());
    }

    /**
     * The first and last day of the week containing the date.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    public static function week(CarbonInterface|string $date): array
    {
        $start = self::date($date)->startOfWeek((int) config('powercollect.closing.week_starts_on'));

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
