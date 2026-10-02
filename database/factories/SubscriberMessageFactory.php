<?php

namespace Database\Factories;

use App\Enums\MessageStatus;
use App\Models\MessageBatch;
use App\Models\Subscriber;
use App\Models\SubscriberMessage;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<SubscriberMessage> */
class SubscriberMessageFactory extends Factory
{
    public function definition(): array
    {
        return [
            'message_batch_id' => MessageBatch::factory(),
            'subscriber_id' => Subscriber::factory(),
            'branch_id' => fn (array $attributes) => Subscriber::find($attributes['subscriber_id'])->branch_id,
            'phone' => '0599'.fake()->numerify('######'),
            'body' => fake()->sentence(),
            'status' => MessageStatus::Pending,
        ];
    }

    /**
     * Turned down by the SMS gateway.
     */
    public function failed(): static
    {
        return $this->state(fn () => ['status' => MessageStatus::Failed, 'error' => 'Gateway error']);
    }
}
