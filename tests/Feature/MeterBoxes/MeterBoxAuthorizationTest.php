<?php

namespace Tests\Feature\MeterBoxes;

use App\Models\Branch;
use App\Models\MeterBox;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MeterBoxAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_view_meter_box_index(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $this->actingAs($superAdmin)
            ->get(route('meter-boxes.index'))
            ->assertOk();
    }

    public function test_super_admin_can_create_a_meter_box_for_any_branch(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $branch = Branch::factory()->create();

        $response = $this->actingAs($superAdmin)->post(route('meter-boxes.store'), [
            'box_number' => 'BOX-100',
            'area' => 'Downtown',
            'location' => 'Main St',
            'branch_id' => $branch->id,
        ]);

        $response->assertRedirect(route('meter-boxes.index'));
        $this->assertDatabaseHas('meter_boxes', [
            'box_number' => 'BOX-100',
            'branch_id' => $branch->id,
        ]);
    }

    public function test_super_admin_can_update_a_meter_box(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $meterBox = MeterBox::factory()->create();

        $response = $this->actingAs($superAdmin)->put(route('meter-boxes.update', $meterBox), [
            'box_number' => 'BOX-UPDATED',
            'branch_id' => $meterBox->branch_id,
        ]);

        $response->assertRedirect(route('meter-boxes.index'));
        $this->assertDatabaseHas('meter_boxes', [
            'id' => $meterBox->id,
            'box_number' => 'BOX-UPDATED',
        ]);
    }

    public function test_branch_admin_cannot_view_meter_box_index(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();

        $this->actingAs($branchAdmin)
            ->get(route('meter-boxes.index'))
            ->assertForbidden();
    }

    public function test_branch_admin_cannot_create_a_meter_box(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();

        $this->actingAs($branchAdmin)
            ->get(route('meter-boxes.create'))
            ->assertForbidden();

        $this->actingAs($branchAdmin)
            ->post(route('meter-boxes.store'), ['box_number' => 'BOX-1'])
            ->assertForbidden();
    }

    public function test_collector_cannot_view_meter_boxes(): void
    {
        $collector = User::factory()->collector()->create();

        $this->actingAs($collector)
            ->get(route('meter-boxes.index'))
            ->assertForbidden();
    }

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get(route('meter-boxes.index'))
            ->assertRedirect(route('login'));
    }
}
