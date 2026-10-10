<?php

use App\Models\Closing;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('closings:open {--date= : The business day (Y-m-d); each branch\'s latest closed day by default}', function () {
    $date = $this->option('date');
    $count = Closing::openForActiveBranches($date, automaticOnly: ! $date);

    if ($date && $count === 0) {
        $this->error('That day has not closed yet.');

        return 1;
    }

    $this->info($date
        ? "Opened the daily closings of {$date} for {$count} branches."
        : "Opened the latest daily closing for {$count} branches whose closings open by themselves.");

    return 0;
})->purpose('Open the daily closing of every active branch whose business day has closed, with its payments');

// Each branch's closing is ready soon after the day's cut-off, whatever time it is set to.
Schedule::command('closings:open')->everyFifteenMinutes();

// The database and the cash hand-over proofs are backed up every night, and sent off the server when a backup disk is set.
Schedule::command('backup:run')->dailyAt('02:30')->withoutOverlapping()->onFailure(fn () => report(new RuntimeException('The nightly backup failed; see the log.')));
