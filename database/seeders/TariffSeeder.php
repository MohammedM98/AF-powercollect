<?php

namespace Database\Seeders;

use App\Models\Tariff;
use Illuminate\Database\Seeder;

class TariffSeeder extends Seeder
{
    /**
     * Seed the two starting tariffs, منزلي and تجاري. Rates are placeholders;
     * set them, and add more tariffs, from the tariffs page.
     */
    public function run(): void
    {
        foreach (['منزلي' => 50, 'تجاري' => 120] as $name => $rate) {
            $tariff = Tariff::firstOrCreate(['name' => $name], ['rate' => $rate]);

            if ($tariff->rateChanges()->doesntExist()) {
                $tariff->rateChanges()->create(['rate' => $tariff->rate]);
            }
        }
    }
}
