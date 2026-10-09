<?php

namespace Database\Factories;

use App\Enums\ClosingPeriodStatus;
use App\Models\ClosingPeriod;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ClosingPeriod>
 */
class ClosingPeriodFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'number' => 'TEST-'.fake()->unique()->numerify('########'),
            'period_start' => now()->startOfWeek()->toDateString(),
            'period_end' => now()->startOfWeek()->addDays(6)->toDateString(),
            'starts_at' => now()->startOfWeek()->utc(),
            'cutoff_at' => now()->startOfWeek()->addWeek()->utc(),
            'eligible_at' => now()->startOfWeek()->addWeek()->utc(),
            'timezone' => 'Asia/Hebron',
            'status' => ClosingPeriodStatus::Open,
        ];
    }
}
