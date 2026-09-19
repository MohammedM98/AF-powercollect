<?php

namespace Database\Factories;

use App\Enums\SubscriberStatus;
use App\Models\Branch;
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
            'phone' => fake()->phoneNumber(),
            'address' => fake()->address(),
            'meter_number' => fake()->unique()->numerify('MTR-#######'),
            'meter_box_id' => MeterBox::factory(),
            'tariff_id' => Tariff::factory(),
            'branch_id' => Branch::factory(),
            'registered_by' => User::factory(),
            'status' => SubscriberStatus::Active,
        ];
    }
}
