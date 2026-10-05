<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\CircuitBreaker;
use App\Models\Subscriber;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DatabaseSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_database_seeder_creates_a_super_admin_and_demo_subscribers(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertTrue(User::where('role', UserRole::SuperAdmin)->exists());
        $this->assertGreaterThan(0, Subscriber::count());
    }

    public function test_every_seeded_subscriber_gets_a_unique_account_number(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertSame(0, Subscriber::whereNull('account_number')->count());
        $this->assertSame(Subscriber::count(), Subscriber::distinct()->count('account_number'));
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

        foreach (['فرع الكرادة' => 25, 'فرع المنصور' => 18, 'فرع العشار' => 20] as $name => $subscriberCount) {
            $branch = Branch::where('name', $name)->sole();
            $this->assertSame($subscriberCount, $branch->subscribers()->count(), "Demo branch [{$name}] has the wrong subscriber count.");
        }
    }

    public function test_demo_subscribers_reuse_the_seeded_unique_breaker_sizes_and_their_minimum_payments(): void
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
        $this->assertTrue($branchAdmin->hasPermission(PermissionKey::CreateSubscribers));
        $this->assertTrue($branchAdmin->hasPermission(PermissionKey::ViewTariffs));
        $this->assertFalse($branchAdmin->hasPermission(PermissionKey::CreateTariffs));
        $this->assertTrue($dataEntry->hasPermission(PermissionKey::RecordMeterReadings));
    }
}
