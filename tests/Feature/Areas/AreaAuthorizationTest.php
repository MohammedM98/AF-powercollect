<?php

namespace Tests\Feature\Areas;

use App\Models\Area;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AreaAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_view_area_index(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $this->actingAs($superAdmin)
            ->get(route('areas.index'))
            ->assertOk();
    }

    public function test_super_admin_can_create_an_area(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $response = $this->actingAs($superAdmin)->post(route('areas.store'), [
            'name' => 'Downtown',
        ]);

        $response->assertRedirect(route('areas.index'));
        $this->assertDatabaseHas('areas', ['name' => 'Downtown']);
    }

    public function test_super_admin_can_update_an_area(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $area = Area::factory()->create(['name' => 'Old Name']);

        $response = $this->actingAs($superAdmin)->put(route('areas.update', $area), [
            'name' => 'New Name',
        ]);

        $response->assertRedirect(route('areas.index'));
        $this->assertDatabaseHas('areas', ['id' => $area->id, 'name' => 'New Name']);
    }

    public function test_cannot_create_two_areas_with_the_same_name(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        Area::factory()->create(['name' => 'Downtown']);

        $this->actingAs($superAdmin)->post(route('areas.store'), [
            'name' => 'Downtown',
        ])->assertSessionHasErrors('name');
    }

    public function test_branch_admin_cannot_view_area_index(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();

        $this->actingAs($branchAdmin)
            ->get(route('areas.index'))
            ->assertForbidden();
    }

    public function test_branch_admin_cannot_create_an_area(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();

        $this->actingAs($branchAdmin)
            ->get(route('areas.create'))
            ->assertForbidden();

        $this->actingAs($branchAdmin)
            ->post(route('areas.store'), ['name' => 'Downtown'])
            ->assertForbidden();
    }

    public function test_collector_cannot_view_areas(): void
    {
        $collector = User::factory()->collector()->create();

        $this->actingAs($collector)
            ->get(route('areas.index'))
            ->assertForbidden();
    }

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get(route('areas.index'))
            ->assertRedirect(route('login'));
    }
}
