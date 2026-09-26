<?php

use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Branch Admins now approve their branch's readings by default, so tick
     * it for the existing ones too — keeping whatever else they have.
     */
    public function up(): void
    {
        $approve = Permission::idsFor([PermissionKey::ApproveMeterReadings]);

        User::query()->where('role', UserRole::BranchAdmin)->each(function (User $user) use ($approve): void {
            $user->permissions()->syncWithoutDetaching($approve);
        });
    }

    /**
     * Ticks can't be told apart from ones a person added later, so they're
     * left as they are.
     */
    public function down(): void
    {
        //
    }
};
