<?php

namespace Tests\Feature\Subscribers;

use App\Enums\SubscriberStatus;
use App\Models\Branch;
use App\Models\MeterBox;
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
        $tariff = Tariff::factory()->home()->create();
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
        $tariff = Tariff::factory()->home()->create();
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
        $tariff = Tariff::factory()->home()->create();

        $response = $this->actingAs($dataEntry)->post(route('subscribers.store'), [
            'full_name' => 'New Customer',
            'phone' => '0770000000',
            'address' => 'Some street',
            'meter_number' => 'MTR-0001',
            'meter_box_id' => $box->id,
            'tariff_id' => $tariff->id,
            'status' => SubscriberStatus::Active->value,
            // Attempt to tamper: request a different branch — must be ignored.
            'branch_id' => $otherBranch->id,
        ]);

        $response->assertRedirect(route('subscribers.index'));
        $this->assertDatabaseHas('subscribers', [
            'meter_number' => 'MTR-0001',
            'branch_id' => $branch->id,
            'registered_by' => $dataEntry->id,
        ]);
    }

    public function test_data_entry_can_register_a_subscriber_without_a_meter_box_yet(): void
    {
        $branch = Branch::factory()->create();
        $dataEntry = User::factory()->dataEntry()->create(['branch_id' => $branch->id]);
        $tariff = Tariff::factory()->business()->create();

        $response = $this->actingAs($dataEntry)->post(route('subscribers.store'), [
            'full_name' => 'No Box Yet',
            'meter_number' => 'MTR-0002',
            'tariff_id' => $tariff->id,
            'status' => SubscriberStatus::Active->value,
        ]);

        $response->assertRedirect(route('subscribers.index'));
        $this->assertDatabaseHas('subscribers', [
            'meter_number' => 'MTR-0002',
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
}
