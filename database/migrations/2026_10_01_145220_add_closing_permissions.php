<?php

use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Add the "Prepare Closings" and "Audit Closings" permissions, and tick
     * "Prepare Closings" for the existing Branch Admins and Accountants, who
     * get it by default — keeping whatever else they have.
     */
    public function up(): void
    {
        [$prepare] = Permission::idsFor([PermissionKey::PrepareClosings, PermissionKey::AuditClosings]);

        User::query()
            ->whereIn('role', [UserRole::BranchAdmin, UserRole::Accountant])
            ->each(fn (User $user) => $user->permissions()->syncWithoutDetaching([$prepare]));
    }

    /**
     * Remove them again, along with anyone's tick for them.
     */
    public function down(): void
    {
        Permission::whereIn('key', [PermissionKey::PrepareClosings->value, PermissionKey::AuditClosings->value])->delete();
    }
};
