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

    'transfer_banks' => ['بنك فلسطين', 'محفظة بالباي', 'جوال باي', 'البنك الإسلامي الفلسطيني', 'البنك الإسلامي العربي'],

    /*
    |--------------------------------------------------------------------------
    | Banks Transfers Come From
    |--------------------------------------------------------------------------
    |
    | The banks and e-wallets a sender can transfer from: every bank above,
    | and the banks the company never receives into.
    |
    */

    'sender_banks' => ['بنك فلسطين', 'محفظة بالباي', 'جوال باي', 'البنك الإسلامي الفلسطيني', 'البنك الإسلامي العربي', 'بنك القدس'],

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
    | Limits
    |--------------------------------------------------------------------------
    |
    | The most a subscription fee may be, whether charged when the subscription
    | is registered or by hand later; anything above is a slip.
    |
    */

    'limits' => [
        'subscription_fee' => (float) env('SUBSCRIPTION_FEE_MAX', 1000),
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

    /*
    |--------------------------------------------------------------------------
    | Payments
    |--------------------------------------------------------------------------
    |
    | A payment above what the subscription owes leaves them in credit, which
    | the forms point out. One above `overpayment_multiplier` times what is
    | owed, and by at least `overpayment_confirmation_minimum` shekels, is
    | probably a slip (5000 for 50), so it is saved only once the collector
    | confirms it. Keep the same two numbers in resources/js/lib/overpayment.js.
    |
    */

    'payments' => [
        'overpayment_multiplier' => 2,
        'overpayment_confirmation_minimum' => 500,
    ],

    /*
    |--------------------------------------------------------------------------
    | Weekly Readings
    |--------------------------------------------------------------------------
    |
    | A week's consumption above `max_weekly_kwh` is refused when entered: no
    | subscription uses that much, so the reading was mistyped. One that is at
    | least `unusual_multiplier` times the subscription's usual (the average
    | of its last `usual_readings` readings, once it has `usual_minimum_readings`)
    | and at least `unusual_minimum_kwh` is saved but flagged: it is never
    | approved in bulk, only one by one after the approver confirms it. A
    | subscription with too few readings to have a usual is flagged from
    | `unusual_without_history_kwh` instead.
    |
    */

    'readings' => [
        'max_weekly_kwh' => (float) env('READING_MAX_WEEKLY_KWH', 20000),
        'unusual_multiplier' => 5,
        'unusual_minimum_kwh' => 200,
        'unusual_without_history_kwh' => 2000,
        'usual_readings' => 8,
        'usual_minimum_readings' => 3,
    ],

];
