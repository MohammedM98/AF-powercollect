<?php

namespace App\Http\Concerns;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

/**
 * One value per calendar day (a count or a sum) for the bar charts and
 * sparklines, with the days that have no rows filled in as zero.
 */
trait BuildsDailySeries
{
    /**
     * `$valueExpression` is the aggregate to chart, e.g. `count(*)` or
     * `sum(subscriber_transactions.amount)`; `$dateColumn` should be
     * qualified with its table. The query must not be ordered.
     *
     * @return array<int, array{date: string, value: float}>
     */
    protected function dailySeries(Builder $query, string $dateColumn, string $valueExpression, int $days): array
    {
        $from = today()->subDays($days - 1);

        $values = (clone $query)
            ->where($dateColumn, '>=', $from)
            ->selectRaw("date({$dateColumn}) as day, {$valueExpression} as value")
            ->groupBy('day')
            ->pluck('value', 'day');

        return collect($this->calendarDays($from, $days))
            ->map(fn (string $day) => ['date' => $day, 'value' => round((float) ($values[$day] ?? 0), 2)])
            ->all();
    }

    /**
     * The dates (Y-m-d) of `$days` consecutive days starting at `$from`.
     *
     * @return array<int, string>
     */
    protected function calendarDays(Carbon $from, int $days): array
    {
        return collect(range(0, $days - 1))
            ->map(fn (int $offset) => $from->copy()->addDays($offset)->toDateString())
            ->all();
    }
}
