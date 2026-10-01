<?php

namespace Database\Factories;

use App\Models\PaymentProvider;
use App\Models\PaymentReceipt;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<PaymentReceipt> */
class PaymentReceiptFactory extends Factory
{
    public function definition(): array
    {
        return [
            'collector_id' => User::factory()->collector(),
            'provider_id' => fn (): int => PaymentProvider::query()->where('code', 'bank_of_palestine')->firstOrFail()->id,
            'original_file_path' => 'payment-receipts/'.fake()->uuid().'.png',
            'file_hash' => hash('sha256', fake()->uuid()),
            'ocr_status' => 'processed',
            'ocr_raw_response' => ['text' => 'Bank of Palestine'],
            'extracted_fields' => [],
            'processed_at' => now(),
        ];
    }
}
