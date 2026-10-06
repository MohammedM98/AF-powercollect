<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\CircuitBreaker;
use App\Models\Subscription;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DatabaseSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_database_seeder_creates_a_super_admin_and_demo_subscriptions(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertTrue(User::where('role', UserRole::SuperAdmin)->exists());
        $this->assertGreaterThan(0, Subscription::count());
    }

    public function test_every_seeded_subscription_gets_a_unique_account_number(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertSame(0, Subscription::whereNull('account_number')->count());
        $this->assertSame(Subscription::count(), Subscription::distinct()->count('account_number'));
    }

    public function test_database_seeder_spreads_demo_data_across_several_branches(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertGreaterThan(1, Branch::count());

        foreach (Branch::all() as $branch) {
            $this->assertTrue(
                User::where('branch_id', $branch->id)->where('role', UserRole::BranchAdmin)->exists(),
                "Branch [{$branch->name}] has no branch admin.",
            );
        }

        foreach (['فرع الكرادة' => 25, 'فرع المنصور' => 18, 'فرع العشار' => 20] as $name => $subscriptionCount) {
            $branch = Branch::where('name', $name)->sole();
            $this->assertSame($subscriptionCount, $branch->subscriptions()->count(), "Demo branch [{$name}] has the wrong subscription count.");
        }
    }

    public function test_demo_subscriptions_reuse_the_seeded_unique_breaker_sizes_and_their_minimum_payments(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertDatabaseCount('circuit_breakers', 7);
        $this->assertDatabaseHas('circuit_breakers', ['ampere' => 2, 'minimum_payment' => 20]);
        $this->assertDatabaseHas('circuit_breakers', ['ampere' => 4, 'minimum_payment' => 20]);
        $this->assertSame(7, CircuitBreaker::distinct()->count('ampere'));
    }

    public function test_seeded_branch_staff_start_with_their_roles_usual_permissions(): void
    {
        $this->seed(DatabaseSeeder::class);

        $branchAdmin = User::where('role', UserRole::BranchAdmin)->firstOrFail();
        $dataEntry = User::where('role', UserRole::DataEntry)->firstOrFail();
        $this->assertTrue($branchAdmin->hasPermission(PermissionKey::CreateSubscriptions));
        $this->assertTrue($branchAdmin->hasPermission(PermissionKey::ViewTariffs));
        $this->assertFalse($branchAdmin->hasPermission(PermissionKey::CreateTariffs));
        $this->assertTrue($dataEntry->hasPermission(PermissionKey::RecordMeterReadings));
    }
}
