<?php

namespace Database\Factories;

use App\Models\ReceiptExample;
use App\Models\ReceiptExampleRun;
use App\Models\User;
use App\Support\ReceiptAccuracy;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<ReceiptExampleRun> */
class ReceiptExampleRunFactory extends Factory
{
    public function definition(): array
    {
        return ['receipt_example_id' => ReceiptExample::factory(), 'tested_by' => User::factory()->superAdmin(),
            'verification_version' => 1, 'parser_version' => ReceiptAccuracy::parserVersion(),
            'mode' => 'cloud', 'status' => 'pending', 'expected_fields' => []];
    }
}
