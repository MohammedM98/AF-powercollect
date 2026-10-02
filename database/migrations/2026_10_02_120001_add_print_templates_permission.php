<?php

use App\Enums\PermissionKey;
use App\Models\Permission;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Add "Manage Print Templates". Templates are shared by the whole
     * company, so only a Super Admin grants it; nobody gets it by default.
     */
    public function up(): void
    {
        Permission::idsFor([PermissionKey::ManagePrintTemplates]);
    }

    /**
     * Remove it again, along with anyone's tick for it.
     */
    public function down(): void
    {
        Permission::where('key', PermissionKey::ManagePrintTemplates->value)->delete();
    }
};
