<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\User;
use Illuminate\Database\Seeder;
use RuntimeException;

class DemoUsersSeeder extends Seeder
{
    /**
     * Seed one branch and one user per staff role, so the differences
     * between roles are visible for local testing. Never run in production
     * — every account here uses the same well-known demo password.
     */
    public function run(): void
    {
        if (app()->environment('production')) {
            throw new RuntimeException('DemoUsersSeeder must not run in production.');
        }

        $branch = Branch::factory()->create([
            'name' => 'Main Branch',
            'location' => 'Baghdad',
        ]);

        User::factory()->branchAdmin()->create([
            'name' => 'Branch Admin Demo',
            'username' => 'branch.admin',
            'password' => 'password',
            'branch_id' => $branch->id,
        ]);

        User::factory()->collector()->create([
            'name' => 'Collector Demo',
            'username' => 'collector',
            'password' => 'password',
            'branch_id' => $branch->id,
        ]);

        User::factory()->dataEntry()->create([
            'name' => 'Data Entry Demo',
            'username' => 'data.entry',
            'password' => 'password',
            'branch_id' => $branch->id,
        ]);

        User::factory()->financialAuditor()->create([
            'name' => 'Financial Auditor Demo',
            'username' => 'auditor',
            'password' => 'password',
            'branch_id' => $branch->id,
        ]);
    }
}
