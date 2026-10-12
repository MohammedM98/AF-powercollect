<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\CashBox;
use App\Models\Closing;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CashBox>
 */
class CashBoxFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'number' => 'BOX-'.fake()->unique()->numerify('########'),
            'branch_id' => Branch::factory(),
            'user_id' => User::factory(),
            'closing_id' => Closing::factory(),
            'status' => 'open',
            'opened_at' => now(),
        ];
    }
}
