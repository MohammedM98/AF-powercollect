<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use RuntimeException;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $password = config('powercollect.super_admin.password');

        if (! $password) {
            if (app()->environment('production')) {
                throw new RuntimeException('SUPER_ADMIN_PASSWORD must be set before seeding in production.');
            }

            $password = 'password';
        }

        User::factory()->superAdmin()->create([
            'name' => config('powercollect.super_admin.name'),
            'username' => config('powercollect.super_admin.username'),
            'password' => $password,
        ]);

        $this->call([
            PermissionSeeder::class,
            TariffSeeder::class,
        ]);
    }
}
