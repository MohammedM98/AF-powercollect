<?php

use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Add "View All Closings" — every branch's closings and the closing
     * reports, read only — and tick it for the existing Financial
     * Auditors, keeping whatever else they have.
     */
    public function up(): void
    {
        $ids = Permission::idsFor([PermissionKey::ViewAllClosings]);

        User::query()
            ->where('role', UserRole::FinancialAuditor)
            ->each(fn (User $user) => $user->permissions()->syncWithoutDetaching($ids));
    }

    /**
     * Remove it again, along with anyone's tick for it.
     */
    public function down(): void
    {
        Permission::where('key', PermissionKey::ViewAllClosings->value)->delete();
    }
};
