<?php

use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Add the "Add Charges and Discounts" permission and tick it for the
     * existing Branch Admins and Accountants, who get it by default —
     * keeping whatever else they have.
     */
    public function up(): void
    {
        $adjust = Permission::idsFor([PermissionKey::AdjustBalances]);

        User::query()
            ->whereIn('role', [UserRole::BranchAdmin, UserRole::Accountant])
            ->each(fn (User $user) => $user->permissions()->syncWithoutDetaching($adjust));
    }

    /**
     * Remove it again, along with anyone's tick for it.
     */
    public function down(): void
    {
        Permission::where('key', PermissionKey::AdjustBalances->value)->delete();
    }
};
