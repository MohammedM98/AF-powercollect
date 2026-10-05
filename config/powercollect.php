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
    | The manager of the مخيم 2 branch, added by BranchManagerSeeder.
    */

    'branch_manager' => [
        'name' => env('BRANCH_MANAGER_NAME', 'Mohammed'),
        'username' => env('BRANCH_MANAGER_USERNAME', 'mohammed'),
        'password' => env('BRANCH_MANAGER_PASSWORD'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Bank Transfer Destinations
    |--------------------------------------------------------------------------
    |
    | The banks and e-wallets offered for the source and destination of
    | a subscriber's transfer. Both show in the البنك column of the
    | account statement.
    |
    */

    'transfer_banks' => ['بنك فلسطين', 'محفظة بالباي', 'جوال باي', 'البنك الإسلامي الفلسطيني', 'البنك الوطني الإسلامي'],

    /*
    |--------------------------------------------------------------------------
    | Usual Charge Amounts
    |--------------------------------------------------------------------------
    |
    | What a charge of each type usually comes to, in shekels, suggested in
    | the charge form (the user can still change it). Types not listed have
    | no usual amount.
    |
    */

    'usual_charges' => [
        'disconnection_fee' => (float) env('USUAL_DISCONNECTION_FEE', 50),
    ],

    /*
    |--------------------------------------------------------------------------
    | Financial Closing
    |--------------------------------------------------------------------------
    |
    | When the business day closes and which day starts the week are set by
    | hand on the closing schedule page. Daily closings are numbered from
    | `first_number`. The cash count offers these shekel notes and coins.
    |
    */

    'closing' => [
        'first_number' => 5001,
        'notes' => [200, 100, 50, 20],
        'coins' => [10, 5, 2, 1],
    ],

];
