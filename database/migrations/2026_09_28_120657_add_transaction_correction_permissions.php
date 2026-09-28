<?php

use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Add the "Edit Transactions" and "Delete Transactions" permissions and
     * tick them for the existing Branch Admins, who get them by default —
     * keeping whatever else they have.
     */
    public function up(): void
    {
        $ids = Permission::idsFor([PermissionKey::CorrectTransactions, PermissionKey::DeleteTransactions]);

        User::query()
            ->where('role', UserRole::BranchAdmin)
            ->each(fn (User $user) => $user->permissions()->syncWithoutDetaching($ids));
    }

    /**
     * Remove them again, along with anyone's tick for them.
     */
    public function down(): void
    {
        Permission::whereIn('key', [PermissionKey::CorrectTransactions->value, PermissionKey::DeleteTransactions->value])->delete();
    }
};
