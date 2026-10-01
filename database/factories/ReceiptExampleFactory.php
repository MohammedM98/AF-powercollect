<?php

namespace Database\Factories;

use App\Models\PaymentProvider;
use App\Models\ReceiptExample;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<ReceiptExample> */
class ReceiptExampleFactory extends Factory
{
    public function definition(): array
    {
        return ['provider_id' => PaymentProvider::query()->where('code', 'bank_of_palestine')->value('id'),
            'uploaded_by' => User::factory()->superAdmin(), 'title' => 'Synthetic receipt example', 'layout' => 'iBURAQ',
            'purpose' => 'tuning', 'original_file_path' => 'receipt-examples/'.fake()->uuid().'.png',
            'file_hash' => hash('sha256', fake()->uuid()), 'verification_version' => 1,
            'verified_fields' => ['transaction_reference' => 'TEST0099', 'sender_name' => 'Test Sender',
                'sender_account' => null, 'amount' => '75.00', 'currency' => 'ILS', 'transferred_at' => '2026-09-23']];
    }
}
