<?php

namespace Database\Factories;

use App\Models\PaymentProvider;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<PaymentProvider> */
class PaymentProviderFactory extends Factory
{
    public function definition(): array
    {
        return ['code' => fake()->unique()->slug(), 'name_en' => fake()->company(),
            'name_ar' => 'مزود تجريبي', 'type' => 'bank', 'is_active' => true];
    }
}
