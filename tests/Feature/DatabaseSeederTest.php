<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Branch;
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

    public function test_database_seeder_spreads_demo_data_across_several_branches(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertGreaterThan(1, Branch::count());

        foreach (Branch::all() as $branch) {
            $this->assertTrue(
                User::where('branch_id', $branch->id)->where('role', UserRole::BranchAdmin)->exists(),
                "Branch [{$branch->name}] has no branch admin.",
            );
            $this->assertTrue(
                Subscriber::where('branch_id', $branch->id)->exists(),
                "Branch [{$branch->name}] has no subscribers.",
            );
        }
    }
}
