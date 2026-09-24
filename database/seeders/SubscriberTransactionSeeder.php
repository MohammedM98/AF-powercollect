<?php

namespace Database\Seeders;

use App\Models\SubscriberTransaction;
use Illuminate\Database\Seeder;

class SubscriberTransactionSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        if (! app()->environment('local', 'testing')) {
            return;
        }

        SubscriberTransaction::factory()->create();
    }
}
