<?php

namespace Tests\Feature\Settings;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Permission;
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

    public function test_super_admin_can_grant_a_permission_to_a_collector(): void
    {
        $this->seedPermissions();
        $superAdmin = User::factory()->superAdmin()->create();
        $branch = Branch::factory()->create();
        $collector = User::factory()->collector()->create(['branch_id' => $branch->id]);
        $manageBranches = Permission::where('key', PermissionKey::ManageBranches->value)->firstOrFail();

        $this->actingAs($superAdmin)->put(route('settings.permissions.update'), [
            'permissions' => [
                $collector->id => [$manageBranches->id],
            ],
        ])->assertRedirect(route('settings.permissions.edit'));

        $this->assertTrue($collector->fresh()->hasPermission(PermissionKey::ManageBranches));
    }

    public function test_granting_manage_branches_lets_a_collector_manage_branches(): void
    {
        $this->seedPermissions();
        $branch = Branch::factory()->create();
        $collector = User::factory()->collector()->create(['branch_id' => $branch->id]);
        $manageBranches = Permission::where('key', PermissionKey::ManageBranches->value)->firstOrFail();
        $collector->permissions()->attach($manageBranches);

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

    public function test_granting_manage_users_lets_a_collector_view_and_update_users_in_their_own_branch_only(): void
    {
        $this->seedPermissions();
        $ownBranch = Branch::factory()->create();
        $otherBranch = Branch::factory()->create();
        $collector = User::factory()->collector()->create(['branch_id' => $ownBranch->id]);
        $peer = User::factory()->collector()->create(['branch_id' => $ownBranch->id, 'name' => 'My Branch Peer']);
        $foreign = User::factory()->collector()->create(['branch_id' => $otherBranch->id, 'name' => 'Other Branch Peer']);
        $manageUsers = Permission::where('key', PermissionKey::ManageUsers->value)->firstOrFail();
        $collector->permissions()->attach($manageUsers);

        $response = $this->actingAs($collector)->get(route('users.index'));
        $response->assertOk();
        $response->assertSee('My Branch Peer');
        $response->assertDontSee('Other Branch Peer');

        $this->actingAs($collector)
            ->put(route('users.update', $peer), [
                'name' => 'Updated Name',
                'username' => $peer->username,
                'email' => $peer->email,
            ])
            ->assertRedirect(route('users.index'));
        $this->assertDatabaseHas('users', ['id' => $peer->id, 'name' => 'Updated Name']);

        $this->actingAs($collector)
            ->get(route('users.edit', $foreign))
            ->assertForbidden();
    }

    public function test_granting_manage_users_does_not_grant_create_ability(): void
    {
        $this->seedPermissions();
        $branch = Branch::factory()->create();
        $collector = User::factory()->collector()->create(['branch_id' => $branch->id]);
        $manageUsers = Permission::where('key', PermissionKey::ManageUsers->value)->firstOrFail();
        $collector->permissions()->attach($manageUsers);

        $this->actingAs($collector)
            ->get(route('users.create'))
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
}
