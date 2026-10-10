<?php

namespace App\Models;

use App\Models\Concerns\OverridableByBranch;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A closing schedule, set by hand on the closing schedule page: the time the
 * business day closes (`cutoff_time`; 00:00 means midnight, otherwise a time
 * from noon on, after which payments count for the next day) and whether each
 * day's closings open by themselves once the day is over.
 *
 * The company's row (no branch) also holds the weekday that starts the week
 * (0 = Sunday … 6 = Saturday), which only the company sets: the weekly and
 * monthly closings approve every branch's days together. A branch that has a
 * row of its own closes its day by that; the others follow the company's.
 */
#[Fillable(['branch_id', 'cutoff_time', 'week_starts_on', 'auto_open', 'frequency', 'arrangement', 'updated_by'])]
class ClosingSetting extends Model
{
    use OverridableByBranch;

    public const DEFAULT_CUTOFF = '00:00';

    public const DEFAULT_WEEK_START = 6;

    protected function casts(): array
    {
        return [
            'branch_id' => 'integer',
            'week_starts_on' => 'integer',
            'auto_open' => 'boolean',
        ];
    }

    public static function createCompanyDefault(): static
    {
        return static::create(['cutoff_time' => self::DEFAULT_CUTOFF, 'week_starts_on' => self::DEFAULT_WEEK_START, 'auto_open' => true, 'frequency' => 'weekly', 'arrangement' => 'combined']);
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
