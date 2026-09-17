<?php

namespace Database\Seeders;

use App\Enums\PermissionKey;
use App\Models\Permission;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        foreach (PermissionKey::cases() as $key) {
            Permission::updateOrCreate(
                ['key' => $key->value],
                ['label' => $key->label()],
            );
        }
    }
}
