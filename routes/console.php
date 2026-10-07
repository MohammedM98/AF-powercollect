<?php

use App\Models\Closing;
use App\Models\ClosingSetting;
use App\Support\ClosingPeriods;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('closings:open {--date= : The business day (Y-m-d); the latest closed day by default}', function () {
    if (! $this->option('date') && ! ClosingSetting::current()->auto_open) {
        $this->info('Closings open by hand: automatic opening is off on the closing schedule page.');

        return 0;
    }

    $day = $this->option('date') ? ClosingPeriods::date($this->option('date')) : ClosingPeriods::latestEndedDay();

    if (! ClosingPeriods::hasEnded($day)) {
        $this->error('That day has not closed yet.');

        return 1;
    }

    $count = Closing::openForActiveBranches($day);
    $this->info("Opened the daily closings of {$day->toDateString()} for {$count} branches.");

    return 0;
})->purpose("Open every active branch's daily closing for a day that has closed, with its payments");

// Each branch's closing is ready soon after the day's cut-off, whatever time it is set to.
Schedule::command('closings:open')->everyFifteenMinutes();

// The database and the cash hand-over proofs are backed up every night, and sent off the server when a backup disk is set.
Schedule::command('backup:run')->dailyAt('02:30')->withoutOverlapping()->onFailure(fn () => report(new RuntimeException('The nightly backup failed; see the log.')));
