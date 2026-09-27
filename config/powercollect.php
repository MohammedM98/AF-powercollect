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

    /*
    |--------------------------------------------------------------------------
    | Bank Transfer Destinations
    |--------------------------------------------------------------------------
    |
    | Where a subscriber can transfer a payment to: the company's bank
    | account and e-wallets. A bank transfer is recorded against one of
    | these, and it shows in the البنك column of the account statement.
    |
    */

    'transfer_banks' => ['بنك فلسطين', 'جوال باي', 'بال باي'],

];
