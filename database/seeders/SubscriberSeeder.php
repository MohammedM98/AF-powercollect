<?php

namespace Database\Seeders;

use App\Enums\SubscriberStatus;
use App\Models\Area;
use App\Models\Branch;
use App\Models\CircuitBreaker;
use App\Models\Governorate;
use App\Models\MeterBox;
use App\Models\SubArea;
use App\Models\Subscriber;
use App\Models\Tariff;
use App\Models\User;
use Illuminate\Database\Seeder;
use RuntimeException;

class SubscriberSeeder extends Seeder
{
    /**
     * Seed a full governorate → area → sub-area → branch → meter box chain,
     * plus a handful of circuit breakers, and a batch of subscribers spread
     * realistically across all of it — enough sample data to exercise the
     * subscriber list, filters, and the area/sub-area/meter-box cascade on
     * the form. Never run in production.
     */
    public function run(): void
    {
        if (app()->environment('production')) {
            throw new RuntimeException('SubscriberSeeder must not run in production.');
        }

        $tariffs = Tariff::all();
        if ($tariffs->isEmpty()) {
            $this->call(TariffSeeder::class);
            $tariffs = Tariff::all();
        }

        $governorate = Governorate::factory()->create(['name' => 'محافظة بغداد']);
        $area = Area::factory()->create(['name' => 'الكرادة', 'governorate_id' => $governorate->id]);
        $subAreas = SubArea::factory()->createMany([
            ['name' => 'حي المنصور', 'area_id' => $area->id],
            ['name' => 'حي الجادرية', 'area_id' => $area->id],
            ['name' => 'حي العرصات', 'area_id' => $area->id],
        ]);

        $branch = Branch::factory()->create([
            'name' => 'فرع الكرادة',
            'governorate_id' => $governorate->id,
            'area_id' => $area->id,
        ]);

        $registrar = User::factory()->dataEntry()->create([
            'name' => 'Karrada Data Entry',
            'username' => 'karrada.data.entry',
            'password' => 'password',
            'branch_id' => $branch->id,
        ]);

        $circuitBreakers = CircuitBreaker::factory()->count(4)->create();

        $meterBoxes = $subAreas->flatMap(fn (SubArea $subArea) => MeterBox::factory()->count(4)->create([
            'branch_id' => $branch->id,
            'sub_area_id' => $subArea->id,
        ]));

        $statuses = [
            SubscriberStatus::Active,
            SubscriberStatus::Active,
            SubscriberStatus::Active,
            SubscriberStatus::Suspended,
            SubscriberStatus::Disconnected,
        ];

        for ($i = 0; $i < 30; $i++) {
            $circuitBreaker = fake()->boolean(80) ? $circuitBreakers->random() : null;
            $meterBox = fake()->boolean(85) ? $meterBoxes->random() : null;

            Subscriber::factory()->create([
                'branch_id' => $branch->id,
                'registered_by' => $registrar->id,
                'tariff_id' => $tariffs->random()->id,
                'meter_box_id' => $meterBox?->id,
                'circuit_breaker_id' => $circuitBreaker?->id,
                'minimum_charge' => $circuitBreaker?->minimum_payment ?? fake()->randomFloat(2, 5, 50),
                'status' => fake()->randomElement($statuses),
            ]);
        }
    }
}
