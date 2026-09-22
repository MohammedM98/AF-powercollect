<?php

namespace Database\Seeders;

use App\Enums\TariffCategory;
use App\Models\Tariff;
use Illuminate\Database\Seeder;

class TariffSeeder extends Seeder
{
    /**
     * Seed the two fixed tariff categories. Rates are placeholders — update
     * them from Settings once a rate-management screen exists.
     */
    public function run(): void
    {
        Tariff::updateOrCreate(['category' => TariffCategory::Residential->value], ['rate' => 50]);
        Tariff::updateOrCreate(['category' => TariffCategory::Commercial->value], ['rate' => 120]);
    }
}
