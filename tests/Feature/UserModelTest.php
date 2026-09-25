<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserModelTest extends TestCase
{
    use RefreshDatabase;

    private const DATA_ENTRY_STARTER_KEYS = [
        'subscribers.view', 'subscribers.create', 'subscribers.update', 'meter_readings.view', 'meter_readings.record',
    ];

    public function test_a_new_user_starts_with_their_roles_usual_permissions(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $branch = Branch::factory()->create();

        $this->actingAs($superAdmin)->post(route('users.store'), [
            'name' => 'Dana Entry',
            'username' => 'dana.entry',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'role' => UserRole::DataEntry->value,
            'branch_id' => $branch->id,
            'is_active' => '1',
        ])->assertRedirect(route('users.index'));

        $this->assertEqualsCanonicalizing(
            self::DATA_ENTRY_STARTER_KEYS,
            User::where('username', 'dana.entry')->firstOrFail()->permissions->pluck('key')->all(),
        );
    }

    public function test_changing_a_users_role_swaps_their_permissions_for_the_new_roles_set(): void
    {
        $collector = User::factory()->collector()->create();
        $collector->permissions()->attach(Permission::idsFor([PermissionKey::ViewBranches]));

        $collector->update(['role' => UserRole::DataEntry]);

        $this->assertEqualsCanonicalizing(self::DATA_ENTRY_STARTER_KEYS, $collector->fresh()->permissions->pluck('key')->all());
    }

    public function test_editing_a_user_without_changing_their_role_keeps_their_permissions(): void
    {
        $dataEntry = User::factory()->dataEntry()->create();
        $dataEntry->permissions()->attach(Permission::idsFor([PermissionKey::ViewTariffs]));

        $dataEntry->update(['name' => 'Renamed']);

        $this->assertTrue($dataEntry->fresh()->hasPermission(PermissionKey::ViewTariffs));
    }
}
