<?php

namespace Database\Factories;

use App\Enums\SubscriberStatus;
use App\Models\Branch;
use App\Models\CircuitBreaker;
use App\Models\MeterBox;
use App\Models\Subscriber;
use App\Models\Tariff;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Subscriber>
 */
class SubscriberFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'full_name' => fake()->name(),
            'national_id' => fake()->unique()->numerify('#########'),
            'initial_reading' => fake()->numberBetween(0, 10000),
            'phone' => fake()->phoneNumber(),
            'address' => fake()->address(),
            'meter_number' => fake()->unique()->numerify('MTR-#######'),
            'meter_box_id' => MeterBox::factory(),
            // Tariffs are fixed reference data (only Home/Business ever
            // exist) — reuse one instead of risking a unique-category
            // collision when creating several subscribers at once.
            'tariff_id' => fn () => Tariff::query()->inRandomOrder()->value('id') ?? Tariff::factory()->residential()->create()->id,
            'branch_id' => Branch::factory(),
            'registered_by' => User::factory(),
            'status' => SubscriberStatus::Active,
            'circuit_breaker_id' => CircuitBreaker::factory(),
            'minimum_charge' => fake()->randomFloat(2, 5, 50),
            'notes' => fake()->sentence(),
        ];
    }
}
