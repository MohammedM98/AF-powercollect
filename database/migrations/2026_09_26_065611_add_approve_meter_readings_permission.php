<?php

use App\Enums\PermissionKey;
use App\Models\Permission;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Add the "Approve Meter Readings" permission, so it can be ticked on
     * the Permissions page right away.
     */
    public function up(): void
    {
        Permission::idsFor([PermissionKey::ApproveMeterReadings]);
    }

    /**
     * Remove it again, along with anyone's tick for it.
     */
    public function down(): void
    {
        Permission::where('key', PermissionKey::ApproveMeterReadings->value)->delete();
    }
};
