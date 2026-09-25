<?php

namespace Tests\Feature\Governorates;

use App\Models\Area;
use App\Models\Governorate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GovernorateAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_view_governorate_index(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $this->actingAs($superAdmin)
            ->get(route('governorates.index'))
            ->assertOk();
    }

    public function test_super_admin_can_create_a_governorate(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $response = $this->actingAs($superAdmin)->post(route('governorates.store'), [
            'name' => 'Baghdad',
        ]);

        $governorate = Governorate::where('name', 'Baghdad')->firstOrFail();
        $response->assertRedirect(route('governorates.index', ['selected' => $governorate->id]));
    }

    public function test_a_governorate_can_be_saved_without_changing_its_name(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $governorate = Governorate::factory()->create(['name' => 'Baghdad']);

        $response = $this->actingAs($superAdmin)->put(route('governorates.update', $governorate), [
            'name' => 'Baghdad',
        ]);

        $response->assertSessionHasNoErrors();
        $response->assertRedirect(route('governorates.index', ['selected' => $governorate->id]));
    }

    public function test_selecting_a_governorate_returns_its_areas(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $governorate = Governorate::factory()->create();
        Area::factory()->create(['governorate_id' => $governorate->id, 'name' => 'Karrada']);
        Area::factory()->create(); // unrelated, different governorate

        $this->actingAs($superAdmin)
            ->get(route('governorates.index', ['selected' => $governorate->id]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('selectedGovernorate.id', $governorate->id)
                ->has('selectedGovernorate.areas', 1)
                ->where('selectedGovernorate.areas.0.name', 'Karrada'));
    }

    public function test_cannot_create_two_governorates_with_the_same_name(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        Governorate::factory()->create(['name' => 'Baghdad']);

        $this->actingAs($superAdmin)->post(route('governorates.store'), [
            'name' => 'Baghdad',
        ])->assertSessionHasErrors('name');
    }

    public function test_branch_admin_cannot_view_governorate_index(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();

        $this->actingAs($branchAdmin)
            ->get(route('governorates.index'))
            ->assertForbidden();
    }

    public function test_branch_admin_cannot_create_a_governorate(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();

        $this->actingAs($branchAdmin)
            ->get(route('governorates.create'))
            ->assertForbidden();

        $this->actingAs($branchAdmin)
            ->post(route('governorates.store'), ['name' => 'Baghdad'])
            ->assertForbidden();
    }

    public function test_collector_cannot_view_governorates(): void
    {
        $collector = User::factory()->collector()->create();

        $this->actingAs($collector)
            ->get(route('governorates.index'))
            ->assertForbidden();
    }

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get(route('governorates.index'))
            ->assertRedirect(route('login'));
    }
}
