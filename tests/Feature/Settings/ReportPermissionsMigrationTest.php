<?php

namespace Tests\Feature\Settings;

use App\Enums\PermissionKey;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReportPermissionsMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_everyone_who_could_view_collections_keeps_the_report_pages_and_nobody_else_gains_them(): void
    {
        $viewer = User::factory()->collector()->create();
        $viewer->permissions()->sync(Permission::idsFor([PermissionKey::ViewCollections]));
        $other = User::factory()->collector()->create();
        $other->permissions()->sync(Permission::idsFor([PermissionKey::ViewSubscribers]));

        (require database_path('migrations/2026_10_04_124546_add_report_permissions.php'))->up();

        $viewer = $viewer->fresh();
        $this->assertTrue($viewer->hasPermission(PermissionKey::ViewBranchPerformance));
        $this->assertTrue($viewer->hasPermission(PermissionKey::ViewDebtAging));
        $this->assertTrue($viewer->hasPermission(PermissionKey::ViewTransactionAudit));
        $this->assertSame(['subscribers.view'], $other->fresh()->permissions->pluck('key')->all());
    }
}
