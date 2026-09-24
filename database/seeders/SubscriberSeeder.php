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
     * Each branch's own governorate → area → sub-area → meter box chain,
     * its branch admin, its data-entry registrar, and a batch of
     * subscribers. Two branches deliberately share a governorate (Baghdad)
     * while having distinct areas, so branch-scoped and governorate-level
     * filters both have something real to narrow down.
     *
     * @var array<int, array{governorate: string, area: string, branch: string, subAreas: array<int, string>, adminUsername: string, adminName: string, subscriberCount: int}>
     */
    private const BRANCHES = [
        [
            'governorate' => 'محافظة بغداد',
            'area' => 'الكرادة',
            'branch' => 'فرع الكرادة',
            'subAreas' => ['حي المنصور', 'حي الجادرية', 'حي العرصات'],
            'adminUsername' => 'karrada.admin',
            'adminName' => 'Karrada Branch Admin',
            'subscriberCount' => 25,
        ],
        [
            'governorate' => 'محافظة بغداد',
            'area' => 'المنصور',
            'branch' => 'فرع المنصور',
            'subAreas' => ['حي الحارثية', 'حي اليرموك'],
            'adminUsername' => 'mansour.admin',
            'adminName' => 'Mansour Branch Admin',
            'subscriberCount' => 18,
        ],
        [
            'governorate' => 'محافظة البصرة',
            'area' => 'العشار',
            'branch' => 'فرع العشار',
            'subAreas' => ['حي الجزائر', 'حي البراضعية'],
            'adminUsername' => 'ashar.admin',
            'adminName' => 'Ashar Branch Admin',
            'subscriberCount' => 20,
        ],
    ];

    private const STATUSES = [
        SubscriberStatus::Active,
        SubscriberStatus::Active,
        SubscriberStatus::Active,
        SubscriberStatus::Suspended,
        SubscriberStatus::Disconnected,
    ];

    /**
     * Seed several branches, each with its own governorate/area/sub-area/
     * meter-box chain, branch admin, data-entry user, and subscribers —
     * enough sample data spread across branches to exercise branch-scoped
     * views, filters, and permissions. Never run in production.
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

        $circuitBreakers = CircuitBreaker::factory()->count(5)->create();
        $governorates = [];

        foreach (self::BRANCHES as $config) {
            $governorates[$config['governorate']] ??= Governorate::factory()->create(['name' => $config['governorate']]);
            $governorate = $governorates[$config['governorate']];

            $area = Area::factory()->create(['name' => $config['area'], 'governorate_id' => $governorate->id]);

            $subAreas = SubArea::factory()->createMany(
                collect($config['subAreas'])->map(fn (string $name) => ['name' => $name, 'area_id' => $area->id])->all(),
            );

            $branch = Branch::factory()->create([
                'name' => $config['branch'],
                'governorate_id' => $governorate->id,
                'area_id' => $area->id,
            ]);

            User::factory()->branchAdmin()->create([
                'name' => $config['adminName'],
                'username' => $config['adminUsername'],
                'password' => 'password',
                'branch_id' => $branch->id,
            ]);

            $registrar = User::factory()->dataEntry()->create([
                'username' => str_replace('.admin', '.data.entry', $config['adminUsername']),
                'password' => 'password',
                'branch_id' => $branch->id,
            ]);

            $meterBoxes = $subAreas->flatMap(fn (SubArea $subArea) => MeterBox::factory()->count(4)->create([
                'branch_id' => $branch->id,
                'sub_area_id' => $subArea->id,
            ]));

            for ($i = 0; $i < $config['subscriberCount']; $i++) {
                $circuitBreaker = fake()->boolean(80) ? $circuitBreakers->random() : null;
                $meterBox = fake()->boolean(85) ? $meterBoxes->random() : null;

                Subscriber::factory()->create([
                    'branch_id' => $branch->id,
                    'registered_by' => $registrar->id,
                    'tariff_id' => $tariffs->random()->id,
                    'meter_box_id' => $meterBox?->id,
                    'circuit_breaker_id' => $circuitBreaker?->id,
                    'minimum_charge' => $circuitBreaker?->minimum_payment ?? fake()->randomFloat(2, 5, 50),
                    'status' => fake()->randomElement(self::STATUSES),
                ]);
            }
        }
    }
}
