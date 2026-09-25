<?php

namespace Tests\Feature\SubAreas;

use App\Models\Area;
use App\Models\SubArea;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubAreaAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_view_the_create_sub_area_form(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $this->actingAs($superAdmin)
            ->get(route('sub-areas.create'))
            ->assertOk();
    }

    public function test_super_admin_can_create_a_sub_area_and_assign_it_to_an_area(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $area = Area::factory()->create();

        $response = $this->actingAs($superAdmin)->post(route('sub-areas.store'), [
            'name' => 'Downtown North',
            'area_id' => $area->id,
        ]);

        $response->assertRedirect(route('governorates.index', ['selectedArea' => $area->id]));
        $this->assertDatabaseHas('sub_areas', ['name' => 'Downtown North', 'area_id' => $area->id]);
    }

    public function test_super_admin_can_create_a_sub_area_without_an_area(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $response = $this->actingAs($superAdmin)->post(route('sub-areas.store'), [
            'name' => 'Downtown North',
        ]);

        $response->assertRedirect(route('governorates.index'));
        $this->assertDatabaseHas('sub_areas', ['name' => 'Downtown North', 'area_id' => null]);
    }

    public function test_super_admin_can_update_a_sub_area(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $subArea = SubArea::factory()->create(['name' => 'Old Name']);

        $response = $this->actingAs($superAdmin)->put(route('sub-areas.update', $subArea), [
            'name' => 'New Name',
        ]);

        $response->assertRedirect(route('governorates.index'));
        $this->assertDatabaseHas('sub_areas', ['id' => $subArea->id, 'name' => 'New Name']);
    }

    public function test_a_sub_area_can_be_saved_without_changing_its_name(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $subArea = SubArea::factory()->create(['name' => 'Block 7']);

        $response = $this->actingAs($superAdmin)->put(route('sub-areas.update', $subArea), [
            'name' => 'Block 7',
        ]);

        $response->assertSessionHasNoErrors();
        $response->assertRedirect(route('governorates.index'));
    }

    public function test_super_admin_can_reassign_a_sub_area_to_a_different_area(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $oldArea = Area::factory()->create();
        $newArea = Area::factory()->create();
        $subArea = SubArea::factory()->create(['area_id' => $oldArea->id]);

        $response = $this->actingAs($superAdmin)->put(route('sub-areas.update', $subArea), [
            'name' => $subArea->name,
            'area_id' => $newArea->id,
        ]);

        $response->assertRedirect(route('governorates.index', ['selectedArea' => $newArea->id]));
        $this->assertDatabaseHas('sub_areas', ['id' => $subArea->id, 'area_id' => $newArea->id]);
    }

    public function test_cannot_create_two_sub_areas_with_the_same_name(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        SubArea::factory()->create(['name' => 'Downtown North']);

        $this->actingAs($superAdmin)->post(route('sub-areas.store'), [
            'name' => 'Downtown North',
        ])->assertSessionHasErrors('name');
    }

    public function test_branch_admin_cannot_create_a_sub_area(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();

        $this->actingAs($branchAdmin)
            ->get(route('sub-areas.create'))
            ->assertForbidden();

        $this->actingAs($branchAdmin)
            ->post(route('sub-areas.store'), ['name' => 'Downtown North'])
            ->assertForbidden();
    }

    public function test_collector_cannot_create_a_sub_area(): void
    {
        $collector = User::factory()->collector()->create();

        $this->actingAs($collector)
            ->get(route('sub-areas.create'))
            ->assertForbidden();
    }

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get(route('sub-areas.create'))
            ->assertRedirect(route('login'));
    }
}
