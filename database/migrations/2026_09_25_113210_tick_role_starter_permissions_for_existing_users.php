<?php

use App\Models\Permission;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Branch Admins and Data Entry users used to get some of their access
     * from their role alone. That access is now ticked like any other
     * permission, so tick each existing user's role starter set — keeping
     * whatever was already ticked — and nobody loses the work they do.
     */
    public function up(): void
    {
        User::query()->each(function (User $user): void {
            $user->permissions()->syncWithoutDetaching(Permission::idsFor($user->role->starterPermissions()));
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
