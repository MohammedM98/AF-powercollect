<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Seeded Super Admin
    |--------------------------------------------------------------------------
    |
    | Credentials for the one Super Admin account the database seeder
    | creates so there's a way to log in on a fresh install. In production
    | these must be set via the environment; the seeder refuses to fall
    | back to a default password outside local/testing environments.
    |
    */

    'super_admin' => [
        'name' => env('SUPER_ADMIN_NAME', 'Super Admin'),
        'username' => env('SUPER_ADMIN_USERNAME', 'admin'),
        'password' => env('SUPER_ADMIN_PASSWORD'),
    ],

];
