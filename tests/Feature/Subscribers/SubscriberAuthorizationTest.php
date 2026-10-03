<?php

namespace Tests\Feature\Subscribers;

use App\Enums\SubscriberStatus;
use App\Models\Area;
use App\Models\Branch;
use App\Models\Governorate;
use App\Models\MeterBox;
use App\Models\SubArea;
use App\Models\Subscriber;
use App\Models\Tariff;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubscriberAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_view_all_subscribers_across_branches(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $branchA = Branch::factory()->create();
        $branchB = Branch::factory()->create();
        $tariff = Tariff::factory()->residential()->create();
        Subscriber::factory()->create(['branch_id' => $branchA->id, 'tariff_id' => $tariff->id, 'full_name' => 'From Branch A']);
        Subscriber::factory()->create(['branch_id' => $branchB->id, 'tariff_id' => $tariff->id, 'full_name' => 'From Branch B']);

        $response = $this->actingAs($superAdmin)->get(route('subscribers.index'));

        $response->assertOk();
        $response->assertSee('From Branch A');
        $response->assertSee('From Branch B');
    }

    public function test_data_entry_only_sees_subscribers_in_their_own_branch(): void
    {
        $branchA = Branch::factory()->create();
        $branchB = Branch::factory()->create();
        $dataEntry = User::factory()->dataEntry()->create(['branch_id' => $branchA->id]);
        $tariff = Tariff::factory()->residential()->create();
        Subscriber::factory()->create(['branch_id' => $branchA->id, 'tariff_id' => $tariff->id, 'full_name' => 'In My Branch']);
        Subscriber::factory()->create(['branch_id' => $branchB->id, 'tariff_id' => $tariff->id, 'full_name' => 'In Other Branch']);

        $response = $this->actingAs($dataEntry)->get(route('subscribers.index'));

        $response->assertOk();
        $response->assertSee('In My Branch');
        $response->assertDontSee('In Other Branch');
    }

    public function test_data_entry_can_register_a_subscriber_in_their_own_branch(): void
    {
        $branch = Branch::factory()->create();
        $otherBranch = Branch::factory()->create();
        $dataEntry = User::factory()->dataEntry()->create(['branch_id' => $branch->id]);
        $box = MeterBox::factory()->create(['branch_id' => $branch->id]);
        $tariff = Tariff::factory()->residential()->create();

        $response = $this->actingAs($dataEntry)->post(route('subscribers.store'), [
            'full_name' => 'New Customer',
            'national_id' => '123456789',
            'initial_reading' => 100,
            'phone' => '0590000000',
            'address' => 'Some street',
            'meter_box_id' => $box->id,
            'tariff_id' => $tariff->id,
            'status' => SubscriberStatus::Active->value,
            'minimum_charge' => 10,
            'notes' => 'No notes',
            // Attempt to tamper: request a different branch — must be ignored.
            'branch_id' => $otherBranch->id,
        ]);

        $response->assertRedirect(route('subscribers.index'));
        $this->assertDatabaseHas('subscribers', [
            'national_id' => '123456789',
            'branch_id' => $branch->id,
            'registered_by' => $dataEntry->id,
        ]);
    }

    public function test_create_form_exposes_the_own_branch_area_subarea_and_meter_boxes_only(): void
    {
        $area = Area::factory()->create();
        $branch = Branch::factory()->inArea($area)->create();
        $otherBranch = Branch::factory()->inArea($area)->create();
        $subArea = SubArea::factory()->create(['area_id' => $area->id]);
        $ownBox = MeterBox::factory()->create(['branch_id' => $branch->id, 'sub_area_id' => $subArea->id]);
        $otherBox = MeterBox::factory()->create(['branch_id' => $otherBranch->id, 'sub_area_id' => $subArea->id]);
        $dataEntry = User::factory()->dataEntry()->create(['branch_id' => $branch->id]);

        $this->actingAs($dataEntry)
            ->get(route('subscribers.create'))
            ->assertInertia(fn ($page) => $page
                ->where('currentBranchAreaId', $area->id)
                ->where('currentBranchAreaName', $area->name)
                ->has('subAreas', 1)
                ->where('subAreas.0.id', $subArea->id)
                ->has('meterBoxes', 1)
                ->where('meterBoxes.0.id', $ownBox->id)
                ->where('meterBoxes.0.sub_area_id', $subArea->id)
                ->missing('meterBoxes.1')
                ->where('meterBoxes.0.id', fn ($id): bool => $id !== $otherBox->id));
    }

    public function test_data_entry_can_register_a_subscriber_without_a_meter_box_yet(): void
    {
        $branch = Branch::factory()->create();
        $dataEntry = User::factory()->dataEntry()->create(['branch_id' => $branch->id]);
        $tariff = Tariff::factory()->commercial()->create();

        $response = $this->actingAs($dataEntry)->post(route('subscribers.store'), [
            'full_name' => 'No Box Yet',
            'national_id' => '987654321',
            'initial_reading' => 100,
            'phone' => '0560000001',
            'address' => 'Some other street',
            'tariff_id' => $tariff->id,
            'status' => SubscriberStatus::Active->value,
            'minimum_charge' => 10,
            'notes' => 'No notes',
        ]);

        $response->assertRedirect(route('subscribers.index'));
        $this->assertDatabaseHas('subscribers', [
            'national_id' => '987654321',
            'meter_box_id' => null,
        ]);
    }

    public function test_branch_admin_can_manage_subscribers_in_their_branch(): void
    {
        $branch = Branch::factory()->create();
        $branchAdmin = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);

        $this->actingAs($branchAdmin)->get(route('subscribers.index'))->assertOk();
        $this->actingAs($branchAdmin)->get(route('subscribers.edit', $subscriber))->assertOk();
    }

    public function test_data_entry_cannot_update_a_subscriber_from_another_branch(): void
    {
        $ownBranch = Branch::factory()->create();
        $otherBranch = Branch::factory()->create();
        $dataEntry = User::factory()->dataEntry()->create(['branch_id' => $ownBranch->id]);
        $foreignSubscriber = Subscriber::factory()->create(['branch_id' => $otherBranch->id]);

        $this->actingAs($dataEntry)
            ->get(route('subscribers.edit', $foreignSubscriber))
            ->assertForbidden();

        $this->actingAs($dataEntry)
            ->put(route('subscribers.update', $foreignSubscriber), ['full_name' => 'Hacked Name'])
            ->assertForbidden();

        $this->assertDatabaseMissing('subscribers', [
            'id' => $foreignSubscriber->id,
            'full_name' => 'Hacked Name',
        ]);
    }

    public function test_collector_has_no_access_to_subscribers_by_default(): void
    {
        $branch = Branch::factory()->create();
        $collector = User::factory()->collector()->create(['branch_id' => $branch->id]);

        $this->actingAs($collector)->get(route('subscribers.index'))->assertForbidden();
        $this->actingAs($collector)->get(route('subscribers.create'))->assertForbidden();
    }

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get(route('subscribers.index'))
            ->assertRedirect(route('login'));
    }

    public function test_subscribers_page_can_be_filtered_by_tariff(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $branch = Branch::factory()->create();
        $residential = Tariff::factory()->residential()->create();
        $commercial = Tariff::factory()->commercial()->create();
        Subscriber::factory()->create(['branch_id' => $branch->id, 'tariff_id' => $residential->id, 'full_name' => 'Residential Subscriber']);
        Subscriber::factory()->create(['branch_id' => $branch->id, 'tariff_id' => $commercial->id, 'full_name' => 'Commercial Subscriber']);

        $response = $this->actingAs($superAdmin)->get(route('subscribers.index', ['filter' => ['tariff_id' => $residential->id]]));

        $response->assertOk();
        $response->assertSee('Residential Subscriber');
        $response->assertDontSee('Commercial Subscriber');
    }

    public function test_subscribers_can_be_filtered_by_box_name_then_by_one_of_its_boxes(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $branch = Branch::factory()->create();
        $campOne = MeterBox::factory()->create(['branch_id' => $branch->id, 'name' => 'camp', 'name_suffix' => '1', 'box_number' => '1234']);
        $campTwo = MeterBox::factory()->create(['branch_id' => $branch->id, 'name' => 'camp', 'name_suffix' => '2', 'box_number' => '1243']);
        $club = MeterBox::factory()->create(['branch_id' => $branch->id, 'name' => 'club', 'name_suffix' => null, 'box_number' => '5000']);
        foreach (['Camp One Subscriber' => $campOne, 'Camp Two Subscriber' => $campTwo, 'Club Subscriber' => $club] as $name => $box) {
            Subscriber::factory()->create(['branch_id' => $branch->id, 'meter_box_id' => $box->id, 'full_name' => $name]);
        }

        $this->actingAs($superAdmin)->get(route('subscribers.index', ['filter' => ['meter_box_name' => 'camp']]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('subscribers.data', 2)
                ->where('filterOptions', function ($groups) use ($branch, $campOne, $campTwo, $club): bool {
                    $groups = collect($groups);
                    $numbers = $groups->firstWhere('key', 'meter_box_id');

                    $withoutScope = fn (array $options): array => collect($options)->map(fn (array $option) => collect($option)->except('scope')->all())->all();

                    return $withoutScope($groups->firstWhere('key', 'meter_box_name')['options']) === [
                        ['value' => 'camp', 'label' => 'camp'],
                        ['value' => 'club', 'label' => 'club'],
                    ] && $numbers['dependsOn'] === 'meter_box_name' && $withoutScope($numbers['options']) === [
                        ['value' => (string) $club->id, 'label' => "(5000) — {$branch->name}", 'parent' => 'club'],
                        ['value' => (string) $campOne->id, 'label' => "1 (1234) — {$branch->name}", 'parent' => 'camp'],
                        ['value' => (string) $campTwo->id, 'label' => "2 (1243) — {$branch->name}", 'parent' => 'camp'],
                    ] && collect($numbers['options'])->every(fn (array $option): bool => $option['scope']['branch_id'] === (string) $branch->id);
                }));

        $this->actingAs($superAdmin)->get(route('subscribers.index', ['filter' => ['meter_box_name' => 'camp', 'meter_box_id' => $campTwo->id]]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('subscribers.data', 1)
                ->where('subscribers.data.0.full_name', 'Camp Two Subscriber'));
    }

    public function test_subscribers_index_carries_the_detail_fields_the_view_modal_needs(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $branch = Branch::factory()->create();
        $governorate = Governorate::factory()->create();
        $branch->update(['governorate_id' => $governorate->id]);
        $tariff = Tariff::factory()->residential()->create();
        Subscriber::factory()->create(['branch_id' => $branch->id, 'tariff_id' => $tariff->id, 'full_name' => 'Detail Fields Subscriber']);

        $response = $this->actingAs($superAdmin)->get(route('subscribers.index'));

        $response->assertOk();
        $response->assertInertia(fn ($page) => $page->has('subscribers.data', 1)
            ->where('subscribers.data.0.full_name', 'Detail Fields Subscriber')
            ->where('subscribers.data.0.tariffRate', (string) $tariff->rate)
            ->where('subscribers.data.0.governorateName', $governorate->name));
    }
}
