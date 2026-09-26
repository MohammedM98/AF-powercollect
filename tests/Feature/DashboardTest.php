<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Governorate;
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
        // Rendered via Inertia now: branch names sit inside the raw JSON
        // page payload, not HTML-escaped Blade output — compare unescaped.
        $response->assertSee($branchA->name, false);
        $response->assertSee($branchB->name, false);
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
        $response->assertSee($ownBranch->name, false);
        $response->assertDontSee($otherBranch->name, false);
    }

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get(route('dashboard'))
            ->assertRedirect(route('login'));
    }

    public function test_the_new_branch_pop_up_loads_its_options_only_when_opened(): void
    {
        Governorate::factory()->create(['name' => 'Baghdad']);
        $superAdmin = User::factory()->superAdmin()->create();

        $response = $this->actingAs($superAdmin)->get(route('dashboard'));

        $response->assertInertia(fn ($page) => $page
            ->where('canCreateBranch', true)
            ->missing('branchForm')
            ->reloadOnly('branchForm', fn ($reload) => $reload->where('branchForm.governorates.0.name', 'Baghdad')));
    }

    public function test_the_new_user_pop_up_offers_a_branch_admin_only_staff_roles_in_their_branch(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();

        $response = $this->actingAs($branchAdmin)->get(route('dashboard'));

        $response->assertInertia(fn ($page) => $page
            ->missing('userForm')
            ->reloadOnly('userForm', fn ($reload) => $reload
                ->where('userForm.canChooseBranch', false)
                ->where('userForm.roleOptions', fn ($options): bool => collect($options)->pluck('value')->all() === ['collector', 'data_entry', 'accountant', 'financial_auditor'])));
    }

    public function test_someone_who_cannot_create_branches_gets_no_branch_pop_up_options(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();

        $response = $this->actingAs($branchAdmin)->get(route('dashboard'));

        $response->assertInertia(fn ($page) => $page->reloadOnly('branchForm', fn ($reload) => $reload->where('branchForm', null)));
    }
}
