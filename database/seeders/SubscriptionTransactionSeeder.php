<?php

namespace Database\Seeders;

use App\Models\SubscriptionTransaction;
use Illuminate\Database\Seeder;

class SubscriptionTransactionSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        if (! app()->environment('local', 'testing')) {
            return;
        }

        SubscriptionTransaction::factory()->create();
    }
}
