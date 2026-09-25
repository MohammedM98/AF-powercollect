<?php

namespace Tests\Feature\Settings;

use App\Enums\PermissionKey;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoleStarterPermissionsMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_existing_users_get_their_roles_usual_permissions_and_keep_their_own(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();
        $dataEntry = User::factory()->dataEntry()->create();
        $branchAdmin->permissions()->sync(Permission::idsFor([PermissionKey::CreateTariffs]));
        $dataEntry->permissions()->detach();

        (require database_path('migrations/2026_09_25_113210_tick_role_starter_permissions_for_existing_users.php'))->up();

        $branchAdmin = $branchAdmin->fresh();
        $this->assertTrue($branchAdmin->hasPermission(PermissionKey::CreateTariffs));
        $this->assertTrue($branchAdmin->hasPermission(PermissionKey::CreateSubscribers));
        $this->assertTrue($branchAdmin->hasPermission(PermissionKey::ViewTariffs));
        $this->assertFalse($branchAdmin->hasPermission(PermissionKey::UpdateTariffs));
        $this->assertEqualsCanonicalizing(
            ['subscribers.view', 'subscribers.create', 'subscribers.update', 'meter_readings.view', 'meter_readings.record'],
            $dataEntry->fresh()->permissions->pluck('key')->all(),
        );
    }
}
