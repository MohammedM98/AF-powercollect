<?php

namespace Database\Factories;

use App\Enums\MeterReadingStatus;
use App\Models\MeterReading;
use App\Models\Subscriber;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Carbon;

/**
 * @extends Factory<MeterReading>
 */
class MeterReadingFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $previousReading = fake()->numberBetween(0, 5000);
        $consumption = fake()->numberBetween(5, 150);

        return [
            'subscriber_id' => Subscriber::factory(),
            'branch_id' => fn (array $attributes) => Subscriber::find($attributes['subscriber_id'])->branch_id,
            'week_start' => fn () => MeterReading::weekStartFor(now()),
            'week_end' => fn (array $attributes) => MeterReading::weekEndFor(Carbon::parse($attributes['week_start'])),
            'previous_reading' => $previousReading,
            'current_reading' => $previousReading + $consumption,
            'consumption' => $consumption,
            'status' => MeterReadingStatus::Pending,
            'recorded_by' => User::factory(),
        ];
    }

    public function approved(): static
    {
        return $this->state(fn () => ['status' => MeterReadingStatus::Approved]);
    }
}
