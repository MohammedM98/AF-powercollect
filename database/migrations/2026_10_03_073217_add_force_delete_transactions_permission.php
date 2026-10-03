<?php

use App\Enums\PermissionKey;
use App\Models\Permission;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Add the permanent-transaction-deletion permission, ticked for nobody.
     * The Super Admin holds every permission and grants this one explicitly.
     */
    public function up(): void
    {
        Permission::idsFor([PermissionKey::ForceDeleteTransactions]);
    }

    /**
     * Remove the permission and any explicit grants of it.
     */
    public function down(): void
    {
        Permission::where('key', PermissionKey::ForceDeleteTransactions->value)->delete();
    }
};
