<?php

namespace Database\Factories;

use App\Enums\ReadingEntryMode;
use App\Models\ReadingEntrySetting;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ReadingEntrySetting>
 */
class ReadingEntrySettingFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'open_days' => ReadingEntrySetting::DEFAULT_OPEN_DAYS,
            'mode' => ReadingEntryMode::Automatic,
        ];
    }

    public function forcedOpen(): static
    {
        return $this->state(fn () => ['mode' => ReadingEntryMode::Open]);
    }

    public function forcedClosed(): static
    {
        return $this->state(fn () => ['mode' => ReadingEntryMode::Closed]);
    }
}
