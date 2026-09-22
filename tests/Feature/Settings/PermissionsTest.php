<?php

namespace Tests\Feature\Settings;

use App\Enums\BillingType;
use App\Enums\PermissionKey;
use App\Enums\SubscriberStatus;
use App\Models\Branch;
use App\Models\Permission;
use App\Models\Tariff;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PermissionsTest extends TestCase
{
    use RefreshDatabase;

    private function seedPermissions(): void
    {
        foreach (PermissionKey::cases() as $key) {
            Permission::create(['key' => $key->value, 'label' => $key->label()]);
        }
    }

    public function test_super_admin_can_view_the_permissions_settings_page(): void
    {
        $this->seedPermissions();
        $superAdmin = User::factory()->superAdmin()->create();

        $this->actingAs($superAdmin)
            ->get(route('settings.permissions.edit'))
            ->assertOk();
    }

    public function test_branch_admin_cannot_view_the_permissions_settings_page(): void
    {
        $this->seedPermissions();
        $branch = Branch::factory()->create();
        $branchAdmin = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);

        $this->actingAs($branchAdmin)
            ->get(route('settings.permissions.edit'))
            ->assertForbidden();
    }

    public function test_collector_cannot_view_the_permissions_settings_page(): void
    {
        $this->seedPermissions();
        $branch = Branch::factory()->create();
        $collector = User::factory()->collector()->create(['branch_id' => $branch->id]);

        $this->actingAs($collector)
            ->get(route('settings.permissions.edit'))
            ->assertForbidden();
    }

    public function test_permissions_page_can_be_searched_by_name_or_username(): void
    {
        $this->seedPermissions();
        $superAdmin = User::factory()->superAdmin()->create();
        $branch = Branch::factory()->create();
        User::factory()->collector()->create(['branch_id' => $branch->id, 'name' => 'Findable Person', 'username' => 'findable']);
        User::factory()->collector()->create(['branch_id' => $branch->id, 'name' => 'Someone Else', 'username' => 'someone-else']);

        $response = $this->actingAs($superAdmin)->get(route('settings.permissions.edit', ['search' => 'Findable']));

        $response->assertOk();
        $response->assertInertia(fn ($page) => $page->has('users.data', 1)
            ->where('users.data.0.name', 'Findable Person'));
    }

    public function test_super_admin_can_grant_a_permission_to_a_collector(): void
    {
        $this->seedPermissions();
        $superAdmin = User::factory()->superAdmin()->create();
        $branch = Branch::factory()->create();
        $collector = User::factory()->collector()->create(['branch_id' => $branch->id]);
        $viewBranches = Permission::where('key', PermissionKey::ViewBranches->value)->firstOrFail();

        $this->actingAs($superAdmin)->put(route('settings.permissions.update'), [
            'permissions' => [
                $collector->id => [$viewBranches->id],
            ],
        ])->assertRedirect(route('settings.permissions.edit'));

        $this->assertTrue($collector->fresh()->hasPermission(PermissionKey::ViewBranches));
    }

    public function test_view_only_branches_permission_allows_viewing_but_not_creating(): void
    {
        $this->seedPermissions();
        $branch = Branch::factory()->create();
        $collector = User::factory()->collector()->create(['branch_id' => $branch->id]);
        $viewBranches = Permission::where('key', PermissionKey::ViewBranches->value)->firstOrFail();
        $collector->permissions()->attach($viewBranches);

        $this->actingAs($collector)
            ->get(route('branches.index'))
            ->assertOk();

        $this->actingAs($collector)->post(route('branches.store'), [
            'name' => 'Should Not Be Created',
            'is_active' => '1',
        ])->assertForbidden();
    }

    public function test_granting_create_and_update_branches_lets_a_collector_fully_manage_branches(): void
    {
        $this->seedPermissions();
        $branch = Branch::factory()->create();
        $collector = User::factory()->collector()->create(['branch_id' => $branch->id]);
        $createBranches = Permission::where('key', PermissionKey::CreateBranches->value)->firstOrFail();
        $updateBranches = Permission::where('key', PermissionKey::UpdateBranches->value)->firstOrFail();
        $collector->permissions()->attach([$createBranches->id, $updateBranches->id]);

        $this->actingAs($collector)
            ->get(route('branches.index'))
            ->assertOk();

        $this->actingAs($collector)->post(route('branches.store'), [
            'name' => 'Granted Branch',
            'is_active' => '1',
        ])->assertRedirect(route('branches.index'));

        $this->assertDatabaseHas('branches', ['name' => 'Granted Branch']);
    }

    public function test_collector_without_the_permission_still_cannot_manage_branches(): void
    {
        $this->seedPermissions();
        $branch = Branch::factory()->create();
        $collector = User::factory()->collector()->create(['branch_id' => $branch->id]);

        $this->actingAs($collector)
            ->get(route('branches.index'))
            ->assertForbidden();
    }

    public function test_granting_update_users_lets_a_collector_view_and_update_users_in_their_own_branch_only(): void
    {
        $this->seedPermissions();
        $ownBranch = Branch::factory()->create();
        $otherBranch = Branch::factory()->create();
        $collector = User::factory()->collector()->create(['branch_id' => $ownBranch->id]);
        $peer = User::factory()->collector()->create(['branch_id' => $ownBranch->id, 'name' => 'My Branch Peer']);
        $foreign = User::factory()->collector()->create(['branch_id' => $otherBranch->id, 'name' => 'Other Branch Peer']);
        $updateUsers = Permission::where('key', PermissionKey::UpdateUsers->value)->firstOrFail();
        $collector->permissions()->attach($updateUsers);

        $response = $this->actingAs($collector)->get(route('users.index'));
        $response->assertOk();
        $response->assertSee('My Branch Peer');
        $response->assertDontSee('Other Branch Peer');

        $this->actingAs($collector)
            ->put(route('users.update', $peer), [
                'name' => 'Updated Name',
                'username' => $peer->username,
            ])
            ->assertRedirect(route('users.index'));
        $this->assertDatabaseHas('users', ['id' => $peer->id, 'name' => 'Updated Name']);

        $this->actingAs($collector)
            ->get(route('users.edit', $foreign))
            ->assertForbidden();
    }

    public function test_granting_update_users_does_not_grant_create_ability(): void
    {
        $this->seedPermissions();
        $branch = Branch::factory()->create();
        $collector = User::factory()->collector()->create(['branch_id' => $branch->id]);
        $updateUsers = Permission::where('key', PermissionKey::UpdateUsers->value)->firstOrFail();
        $collector->permissions()->attach($updateUsers);

        $this->actingAs($collector)
            ->get(route('users.create'))
            ->assertForbidden();
    }

    public function test_granting_subscriber_permissions_lets_a_collector_manage_subscribers(): void
    {
        $this->seedPermissions();
        $branch = Branch::factory()->create();
        $collector = User::factory()->collector()->create(['branch_id' => $branch->id]);
        $createSubscribers = Permission::where('key', PermissionKey::CreateSubscribers->value)->firstOrFail();
        $viewSubscribers = Permission::where('key', PermissionKey::ViewSubscribers->value)->firstOrFail();
        $collector->permissions()->attach([$createSubscribers->id, $viewSubscribers->id]);
        $tariff = Tariff::factory()->home()->create();

        $this->actingAs($collector)
            ->get(route('subscribers.index'))
            ->assertOk();

        $this->actingAs($collector)->post(route('subscribers.store'), [
            'full_name' => 'Granted Subscriber',
            'national_id' => '123456789',
            'initial_reading' => 100,
            'phone' => '0770000002',
            'address' => 'Some street',
            'meter_number' => 'MTR-9999',
            'tariff_id' => $tariff->id,
            'status' => SubscriberStatus::Active->value,
            'billing_type' => BillingType::Meter->value,
            'unit_price' => 5,
            'minimum_charge' => 10,
            'notes' => 'No notes',
        ])->assertRedirect(route('subscribers.index'));

        $this->assertDatabaseHas('subscribers', ['meter_number' => 'MTR-9999', 'branch_id' => $branch->id]);
    }

    public function test_collector_without_the_permission_still_cannot_manage_subscribers(): void
    {
        $this->seedPermissions();
        $branch = Branch::factory()->create();
        $collector = User::factory()->collector()->create(['branch_id' => $branch->id]);

        $this->actingAs($collector)
            ->get(route('subscribers.index'))
            ->assertForbidden();
    }

    public function test_super_admin_implicitly_has_every_permission_without_any_grants(): void
    {
        $this->seedPermissions();
        $superAdmin = User::factory()->superAdmin()->create();

        foreach (PermissionKey::cases() as $key) {
            $this->assertTrue($superAdmin->hasPermission($key));
        }
    }

    public function test_saving_permissions_for_one_page_of_users_does_not_wipe_grants_of_users_on_another_page(): void
    {
        $this->seedPermissions();
        $superAdmin = User::factory()->superAdmin()->create();
        $branch = Branch::factory()->create();

        $untouched = User::factory()->collector()->create(['branch_id' => $branch->id]);
        $viewBranches = Permission::where('key', PermissionKey::ViewBranches->value)->firstOrFail();
        $untouched->permissions()->attach($viewBranches);

        $editedUser = User::factory()->collector()->create(['branch_id' => $branch->id]);
        $viewSubscribers = Permission::where('key', PermissionKey::ViewSubscribers->value)->firstOrFail();

        // Only $editedUser is present in the payload — simulating a save
        // made while $untouched was on a different search result/page.
        $this->actingAs($superAdmin)->put(route('settings.permissions.update'), [
            'permissions' => [
                $editedUser->id => [$viewSubscribers->id],
            ],
        ])->assertRedirect(route('settings.permissions.edit'));

        $this->assertTrue($editedUser->fresh()->hasPermission(PermissionKey::ViewSubscribers));
        $this->assertTrue($untouched->fresh()->hasPermission(PermissionKey::ViewBranches));
    }
}
