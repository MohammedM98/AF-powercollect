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
        foreach ([TariffCategory::Residential->value => 50, TariffCategory::Commercial->value => 120] as $category => $rate) {
            $tariff = Tariff::updateOrCreate(['category' => $category], ['rate' => $rate]);

            if ($tariff->rateChanges()->doesntExist()) {
                $tariff->rateChanges()->create(['rate' => $tariff->rate]);
            }
        }
    }
}
