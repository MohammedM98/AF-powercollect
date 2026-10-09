<?php

namespace Database\Factories;

use App\Enums\ClosingStatus;
use App\Enums\ClosingType;
use App\Models\Closing;
use App\Models\ClosingSnapshotLine;
use App\Models\SubscriptionTransaction;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ClosingSnapshotLine>
 */
class ClosingSnapshotLineFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'subscription_transaction_id' => SubscriptionTransaction::factory()->state(['type' => SubscriptionTransaction::TYPE_INVOICE, 'amount' => '50.00']),
            'classification' => 'charge',
            'ledger_effect' => '50.00',
            'collection_effect' => '0.00',
            'payment_method' => null,
            'channel' => null,
            'details' => fn (array $attributes): array => [
                'transactionId' => $attributes['subscription_transaction_id'],
                'classification' => $attributes['classification'],
                'ledgerEffect' => $attributes['ledger_effect'],
                'collectionEffect' => $attributes['collection_effect'],
                'method' => $attributes['payment_method'],
                'channel' => $attributes['channel'],
            ],
            'closing_id' => fn (array $attributes): int => Closing::factory()->create([
                'type' => ClosingType::Weekly, 'status' => ClosingStatus::Approved,
                'snapshot' => ['report' => ['lines' => [$attributes['details']]]],
            ])->id,
        ];
    }
}
