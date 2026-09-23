<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Subscriber;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DatabaseSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_database_seeder_creates_a_super_admin_and_demo_subscribers(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertTrue(User::where('role', UserRole::SuperAdmin)->exists());
        $this->assertGreaterThan(0, Subscriber::count());
    }
}
