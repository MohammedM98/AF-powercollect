<?php

use App\Models\Branch;
use App\Models\Closing;
use App\Support\ClosingPeriods;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('closings:open {--date= : The business day (Y-m-d); yesterday by default}', function () {
    $day = $this->option('date') ? ClosingPeriods::date($this->option('date')) : ClosingPeriods::latestEndedDay();

    if (! ClosingPeriods::hasEnded($day)) {
        $this->error('That day has not ended yet.');

        return 1;
    }

    $branches = Branch::query()->where('is_active', true)->orderBy('id')->get();

    foreach ($branches as $branch) {
        Closing::dailyFor($branch, $day)->syncPayments();
    }

    $this->info("Opened the daily closings of {$day->toDateString()} for {$branches->count()} branches.");

    return 0;
})->purpose("Open every active branch's daily closing for a day that has ended, with its payments");

// Every branch's closing is ready at the start of the next business day.
Schedule::command('closings:open')->dailyAt('00:05')->timezone(config('app.business_timezone'));
