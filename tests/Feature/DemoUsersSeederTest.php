<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\User;
use Database\Seeders\DemoUsersSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DemoUsersSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_creates_one_user_per_staff_role_in_the_same_branch(): void
    {
        $this->seed(DemoUsersSeeder::class);

        $this->assertDatabaseHas('users', ['username' => 'branch.admin', 'role' => UserRole::BranchAdmin->value]);
        $this->assertDatabaseHas('users', ['username' => 'collector', 'role' => UserRole::Collector->value]);
        $this->assertDatabaseHas('users', ['username' => 'data.entry', 'role' => UserRole::DataEntry->value]);
        $this->assertDatabaseHas('users', ['username' => 'auditor', 'role' => UserRole::FinancialAuditor->value]);

        $branchIds = User::whereIn('username', ['branch.admin', 'collector', 'data.entry', 'auditor'])
            ->pluck('branch_id')
            ->unique();

        $this->assertCount(1, $branchIds);
    }
}
