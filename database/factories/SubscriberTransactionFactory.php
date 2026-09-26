<?php

namespace Database\Factories;

use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SubscriberTransaction>
 */
class SubscriberTransactionFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'subscriber_id' => Subscriber::factory(),
            'recorded_by' => fn (array $attributes): int => Subscriber::findOrFail($attributes['subscriber_id'])->registered_by,
            'type' => 'subscription_fee',
            'source_key' => fn (array $attributes): string => 'subscription-fee:'.$attributes['subscriber_id'],
            'amount' => '50.00',
            'currency_amount' => fn (array $attributes): string => ltrim((string) $attributes['amount'], '-'),
        ];
    }
}
