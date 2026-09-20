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

        $response->assertRedirect(route('governorates.index'));
        $this->assertDatabaseHas('governorates', ['name' => 'Baghdad']);
    }

    public function test_creating_a_governorate_assigns_the_selected_areas(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $areaOne = Area::factory()->create();
        $areaTwo = Area::factory()->create();
        $unrelatedArea = Area::factory()->create();

        $this->actingAs($superAdmin)->post(route('governorates.store'), [
            'name' => 'Baghdad',
            'area_ids' => [$areaOne->id, $areaTwo->id],
        ])->assertRedirect(route('governorates.index'));

        $governorate = Governorate::where('name', 'Baghdad')->firstOrFail();

        $this->assertDatabaseHas('areas', ['id' => $areaOne->id, 'governorate_id' => $governorate->id]);
        $this->assertDatabaseHas('areas', ['id' => $areaTwo->id, 'governorate_id' => $governorate->id]);
        $this->assertDatabaseHas('areas', ['id' => $unrelatedArea->id, 'governorate_id' => null]);
    }

    public function test_updating_a_governorate_reassigns_its_areas(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $governorate = Governorate::factory()->create();
        $keptArea = Area::factory()->create(['governorate_id' => $governorate->id]);
        $droppedArea = Area::factory()->create(['governorate_id' => $governorate->id]);
        $addedArea = Area::factory()->create();

        $this->actingAs($superAdmin)->put(route('governorates.update', $governorate), [
            'name' => $governorate->name,
            'area_ids' => [$keptArea->id, $addedArea->id],
        ])->assertRedirect(route('governorates.index'));

        $this->assertDatabaseHas('areas', ['id' => $keptArea->id, 'governorate_id' => $governorate->id]);
        $this->assertDatabaseHas('areas', ['id' => $addedArea->id, 'governorate_id' => $governorate->id]);
        $this->assertDatabaseHas('areas', ['id' => $droppedArea->id, 'governorate_id' => null]);
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
