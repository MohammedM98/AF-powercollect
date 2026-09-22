<?php

namespace Tests\Feature\MeterBoxes;

use App\Enums\PermissionKey;
use App\Models\Area;
use App\Models\Branch;
use App\Models\MeterBox;
use App\Models\Permission;
use App\Models\SubArea;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MeterBoxValidationTest extends TestCase
{
    use RefreshDatabase;

    public function test_can_create_a_meter_box_with_a_sub_area_belonging_to_the_branch_area(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $area = Area::factory()->create();
        $branch = Branch::factory()->create(['area_id' => $area->id]);
        $subArea = SubArea::factory()->create(['area_id' => $area->id]);

        $response = $this->actingAs($superAdmin)->post(route('meter-boxes.store'), [
            'name' => 'Main Box',
            'box_number' => 'BOX-100',
            'branch_id' => $branch->id,
            'sub_area_id' => $subArea->id,
        ]);

        $response->assertRedirect(route('meter-boxes.index'));
        $this->assertDatabaseHas('meter_boxes', [
            'box_number' => 'BOX-100',
            'sub_area_id' => $subArea->id,
        ]);
    }

    public function test_cannot_create_a_meter_box_with_a_sub_area_from_a_different_area(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $branchArea = Area::factory()->create();
        $otherArea = Area::factory()->create();
        $branch = Branch::factory()->create(['area_id' => $branchArea->id]);
        $subArea = SubArea::factory()->create(['area_id' => $otherArea->id]);

        $response = $this->actingAs($superAdmin)->post(route('meter-boxes.store'), [
            'name' => 'Main Box',
            'box_number' => 'BOX-101',
            'branch_id' => $branch->id,
            'sub_area_id' => $subArea->id,
        ]);

        $response->assertSessionHasErrors('sub_area_id');
        $this->assertDatabaseMissing('meter_boxes', ['box_number' => 'BOX-101']);
    }

    public function test_can_create_a_meter_box_without_a_sub_area(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $branch = Branch::factory()->create();

        $response = $this->actingAs($superAdmin)->post(route('meter-boxes.store'), [
            'name' => 'Main Box',
            'box_number' => 'BOX-102',
            'branch_id' => $branch->id,
        ]);

        $response->assertRedirect(route('meter-boxes.index'));
        $this->assertDatabaseHas('meter_boxes', ['box_number' => 'BOX-102', 'sub_area_id' => null]);
    }

    public function test_cannot_update_a_meter_box_with_a_sub_area_from_a_different_area(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $branchArea = Area::factory()->create();
        $otherArea = Area::factory()->create();
        $branch = Branch::factory()->create(['area_id' => $branchArea->id]);
        $meterBox = MeterBox::factory()->create(['branch_id' => $branch->id]);
        $subArea = SubArea::factory()->create(['area_id' => $otherArea->id]);

        $response = $this->actingAs($superAdmin)->put(route('meter-boxes.update', $meterBox), [
            'name' => $meterBox->name,
            'box_number' => $meterBox->box_number,
            'branch_id' => $branch->id,
            'sub_area_id' => $subArea->id,
        ]);

        $response->assertSessionHasErrors('sub_area_id');
        $this->assertDatabaseHas('meter_boxes', ['id' => $meterBox->id, 'sub_area_id' => null]);
    }

    public function test_data_entry_can_create_a_meter_box_with_a_sub_area_of_their_own_branch_area(): void
    {
        $area = Area::factory()->create();
        $branch = Branch::factory()->create(['area_id' => $area->id]);
        $dataEntry = User::factory()->dataEntry()->create(['branch_id' => $branch->id]);
        $dataEntry->permissions()->attach(
            Permission::create(['key' => PermissionKey::CreateMeterBoxes->value, 'label' => PermissionKey::CreateMeterBoxes->label()]),
        );
        $subArea = SubArea::factory()->create(['area_id' => $area->id]);

        $response = $this->actingAs($dataEntry)->post(route('meter-boxes.store'), [
            'name' => 'Main Box',
            'box_number' => 'BOX-200',
            'sub_area_id' => $subArea->id,
        ]);

        $response->assertRedirect(route('meter-boxes.index'));
        $this->assertDatabaseHas('meter_boxes', [
            'box_number' => 'BOX-200',
            'branch_id' => $branch->id,
            'sub_area_id' => $subArea->id,
        ]);
    }

    public function test_data_entry_cannot_create_a_meter_box_with_a_sub_area_outside_their_own_branch_area(): void
    {
        $area = Area::factory()->create();
        $otherArea = Area::factory()->create();
        $branch = Branch::factory()->create(['area_id' => $area->id]);
        $dataEntry = User::factory()->dataEntry()->create(['branch_id' => $branch->id]);
        $dataEntry->permissions()->attach(
            Permission::create(['key' => PermissionKey::CreateMeterBoxes->value, 'label' => PermissionKey::CreateMeterBoxes->label()]),
        );
        $subArea = SubArea::factory()->create(['area_id' => $otherArea->id]);

        $response = $this->actingAs($dataEntry)->post(route('meter-boxes.store'), [
            'name' => 'Main Box',
            'box_number' => 'BOX-201',
            'sub_area_id' => $subArea->id,
        ]);

        $response->assertSessionHasErrors('sub_area_id');
        $this->assertDatabaseMissing('meter_boxes', ['box_number' => 'BOX-201']);
    }
}
