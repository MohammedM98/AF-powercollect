<?php

namespace Database\Seeders;

use App\Enums\SubscriptionStatus;
use App\Enums\TariffCategory;
use App\Enums\UserRole;
use App\Models\Subscription;
use App\Models\Tariff;
use App\Models\User;
use Illuminate\Database\Seeder;
use RuntimeException;

class SampleSubscriptionsSeeder extends Seeder
{
    /**
     * Five subscriptions in different states: two active, two waiting (one
     * with its starting reading already entered, one without) and one
     * disconnected.
     *
     * @var array<int, array{full_name: string, national_id: string, phone: string, status: SubscriptionStatus, initial_reading: ?float, subscription_date: string}>
     */
    private const SUBSCRIPTIONS = [
        ['full_name' => 'محمد', 'national_id' => '400000001', 'phone' => '0599000001', 'status' => SubscriptionStatus::Active, 'initial_reading' => 1200, 'subscription_date' => '2026-03-01'],
        ['full_name' => 'مصطفى', 'national_id' => '400000002', 'phone' => '0599000002', 'status' => SubscriptionStatus::Active, 'initial_reading' => 350.5, 'subscription_date' => '2026-08-15'],
        ['full_name' => 'خليل', 'national_id' => '400000003', 'phone' => '0569000003', 'status' => SubscriptionStatus::Suspended, 'initial_reading' => null, 'subscription_date' => '2026-10-01'],
        ['full_name' => 'أحمد', 'national_id' => '400000004', 'phone' => '0599000004', 'status' => SubscriptionStatus::Disconnected, 'initial_reading' => 5400, 'subscription_date' => '2025-11-10'],
        ['full_name' => 'طه', 'national_id' => '400000005', 'phone' => '0569000005', 'status' => SubscriptionStatus::Suspended, 'initial_reading' => 80, 'subscription_date' => '2026-10-03'],
    ];

    /**
     * Seed the subscriptions in the branch of مخيم 2. Safe to run again: a
     * subscription with the same national ID is kept.
     */
    public function run(): void
    {
        $this->call(LocationSeeder::class);

        $branch = LocationSeeder::branch();
        $tariff = Tariff::query()->where('category', TariffCategory::Residential->value)->first()
            ?? throw new RuntimeException('شغّل TariffSeeder أولًا.');
        $registrar = User::query()->where('role', UserRole::SuperAdmin->value)->first()
            ?? User::query()->where('branch_id', $branch->id)->firstOrFail();

        foreach (self::SUBSCRIPTIONS as $subscription) {
            if (Subscription::query()->where('national_id', $subscription['national_id'])->exists()) {
                continue;
            }

            Subscription::query()->create([
                ...$subscription,
                // أحمد was active before he was disconnected.
                ...($subscription['status'] === SubscriptionStatus::Disconnected ? ['activated_at' => $subscription['subscription_date']] : []),
                'branch_id' => $branch->id,
                'tariff_id' => $tariff->id,
                'registered_by' => $registrar->id,
                'minimum_charge' => 30,
            ]);
        }
    }
}
