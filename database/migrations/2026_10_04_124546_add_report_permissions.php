<?php

use App\Enums\PermissionKey;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * The permissions of the branch performance, debt aging and audit log
     * pages, which "View Collections" used to open along with the financial
     * log. Everyone who holds it now gets all three, so nobody loses a page.
     */
    private const REPORTS = [PermissionKey::ViewBranchPerformance, PermissionKey::ViewDebtAging, PermissionKey::ViewTransactionAudit];

    public function up(): void
    {
        $ids = Permission::idsFor(self::REPORTS);

        User::query()
            ->whereHas('permissions', fn ($permissions) => $permissions->where('key', PermissionKey::ViewCollections->value))
            ->each(fn (User $user) => $user->permissions()->syncWithoutDetaching($ids));
    }

    /**
     * Remove them again, along with anyone's tick for them.
     */
    public function down(): void
    {
        Permission::query()->whereIn('key', array_map(fn (PermissionKey $key): string => $key->value, self::REPORTS))->delete();
    }
};
