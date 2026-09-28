<?php

use App\Enums\PermissionKey;
use App\Models\Permission;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Add a "Delete" permission for each kind of record, ticked for nobody:
     * the Super Admin holds every permission, and grants these by hand.
     */
    public function up(): void
    {
        Permission::idsFor($this->keys());
    }

    /**
     * Remove them again, along with anyone's tick for them.
     */
    public function down(): void
    {
        Permission::whereIn('key', array_map(fn (PermissionKey $key): string => $key->value, $this->keys()))->delete();
    }

    /**
     * @return array<int, PermissionKey>
     */
    private function keys(): array
    {
        return [
            PermissionKey::DeleteBranches, PermissionKey::DeleteUsers, PermissionKey::DeleteSubscribers,
            PermissionKey::DeleteTariffs, PermissionKey::DeleteCircuitBreakers, PermissionKey::DeleteMeterBoxes,
            PermissionKey::DeleteAreas, PermissionKey::DeleteSubAreas, PermissionKey::DeleteGovernorates,
        ];
    }
};
