<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_sees_stats_across_all_branches(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $branchA = Branch::factory()->create(['is_active' => true]);
        $branchB = Branch::factory()->create(['is_active' => false]);
        User::factory()->collector()->create(['branch_id' => $branchA->id, 'name' => 'Alpha Collector']);
        User::factory()->collector()->create(['branch_id' => $branchB->id, 'name' => 'Beta Collector']);

        $response = $this->actingAs($superAdmin)->get(route('dashboard'));

        $response->assertOk();
        $response->assertSee('Alpha Collector');
        $response->assertSee('Beta Collector');
        $response->assertSee($branchA->name);
        $response->assertSee($branchB->name);
    }

    public function test_branch_admin_only_sees_their_own_branch_in_dashboard_stats(): void
    {
        $ownBranch = Branch::factory()->create();
        $otherBranch = Branch::factory()->create();
        $branchAdmin = User::factory()->branchAdmin()->create(['branch_id' => $ownBranch->id]);
        User::factory()->collector()->create(['branch_id' => $ownBranch->id, 'name' => 'My Branch Collector']);
        User::factory()->collector()->create(['branch_id' => $otherBranch->id, 'name' => 'Other Branch Collector']);

        $response = $this->actingAs($branchAdmin)->get(route('dashboard'));

        $response->assertOk();
        $response->assertSee('My Branch Collector');
        $response->assertDontSee('Other Branch Collector');
        $response->assertSee($ownBranch->name);
        $response->assertDontSee($otherBranch->name);
    }

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get(route('dashboard'))
            ->assertRedirect(route('login'));
    }
}
