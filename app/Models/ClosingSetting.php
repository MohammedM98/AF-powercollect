<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The company's closing schedule, set by hand on the closing schedule page:
 * the time the business day closes (`cutoff_time`; 00:00 means midnight,
 * otherwise a time from noon on, after which payments count for the next
 * day), the weekday that starts the week (0 = Sunday … 6 = Saturday), and
 * whether each day's closings open by themselves once the day is over.
 */
#[Fillable(['cutoff_time', 'week_starts_on', 'auto_open', 'updated_by', 'weekly_enabled', 'weekly_closing_day', 'weekly_closing_time', 'weekly_timezone', 'grace_period_minutes', 'auto_prepare'])]
class ClosingSetting extends Model
{
    public const DEFAULT_CUTOFF = '00:00';

    public const DEFAULT_WEEK_START = 6;

    protected static function booted(): void
    {
        // current() keeps the setting for the request; reload it once it changes.
        static::saved(fn () => app()->forgetInstance(self::class));
    }

    protected function casts(): array
    {
        return [
            'week_starts_on' => 'integer',
            'auto_open' => 'boolean',
            'weekly_enabled' => 'boolean',
            'weekly_closing_day' => 'integer',
            'grace_period_minutes' => 'integer',
            'auto_prepare' => 'boolean',
        ];
    }

    /**
     * The company-wide setting, loaded once per request or job (see
     * AppServiceProvider).
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
            ?? static::create(['cutoff_time' => self::DEFAULT_CUTOFF, 'week_starts_on' => self::DEFAULT_WEEK_START, 'auto_open' => true])->refresh();
    }

    /**
     * The cut-off as HH:MM.
     */
    public function cutoff(): string
    {
        return substr((string) $this->cutoff_time, 0, 5);
    }

    /**
     * Minutes after a day's midnight at which it closes: midnight (00:00)
     * closes it at the end of the day.
     */
    public function cutoffMinutes(): int
    {
        [$hours, $minutes] = array_map('intval', explode(':', $this->cutoff()));
        $total = $hours * 60 + $minutes;

        return $total === 0 ? 24 * 60 : $total;
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
