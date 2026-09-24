<?php

namespace App\Models;

use App\Enums\ReadingEntryMode;
use Carbon\CarbonInterface;
use Database\Factories\ReadingEntrySettingFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['open_days', 'mode', 'updated_by'])]
class ReadingEntrySetting extends Model
{
    /** @use HasFactory<ReadingEntrySettingFactory> */
    use HasFactory;

    /**
     * Reading entry opens on Thursday unless configured otherwise.
     */
    public const DEFAULT_OPEN_DAYS = [CarbonInterface::THURSDAY];

    protected function casts(): array
    {
        return [
            'open_days' => 'array',
            'mode' => ReadingEntryMode::class,
        ];
    }

    /**
     * The company-wide setting, created with the defaults on first use.
     */
    public static function current(): self
    {
        return static::query()->oldest('id')->first()
            ?? static::create(['open_days' => self::DEFAULT_OPEN_DAYS, 'mode' => ReadingEntryMode::Automatic]);
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

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
