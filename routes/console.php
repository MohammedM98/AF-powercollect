<?php

use App\Http\Concerns\PresentsClosings;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\ClosingPeriod;
use App\Models\ClosingSetting;
use App\Models\User;
use App\Support\ClosingPeriods;
use App\Support\WeeklyClosingService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
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

Artisan::command('closings:prepare', function (): int {
    $service = app(WeeklyClosingService::class);

    return DB::transaction(function () use ($service): int {
        $setting = $service->lock();
        if (! $setting->weekly_enabled || ! $setting->auto_prepare) {
            return 0;
        }
        $current = $service->forMoment(now());
        $service->forMoment($current->starts_at->subSecond());
        foreach (ClosingPeriod::query()->where('status', 'open')->where('cutoff_at', '<=', now())->get() as $period) {
            $service->prepare($period);
        }
        $this->info('Eligible weekly periods prepared for manual closing.');

        return 0;
    });
})->purpose('Prepare weeks after cutoff without approving or changing financial history');
Schedule::command('closings:prepare')->everyMinute()->withoutOverlapping();

Artisan::command('closings:freeze-legacy', function (): int {
    $actor = User::query()->first();
    if ($actor === null) {
        return 0;
    }
    $presenter = new class
    {
        use PresentsClosings;

        public function view(Closing $closing, User $actor): array
        {
            return $this->periodData('weekly', ClosingPeriods::date($closing->period_start), Branch::query()->orderBy('name')->get(), $actor);
        }
    };
    $service = app(WeeklyClosingService::class);
    Closing::query()->where('type', 'weekly')->where('status', 'approved')->whereNull('snapshot')->each(function (Closing $closing) use ($service, $presenter, $actor): void {
        $service->freezeLegacy($closing, $presenter->view($closing, $actor));
    });
    $this->info('Legacy closing baselines captured and labelled with their upgrade provenance.');

    return 0;
})->purpose('Freeze available legacy weekly reports as explicitly labelled upgrade baselines');

// The database and the cash hand-over proofs are backed up every night, and sent off the server when a backup disk is set.
Schedule::command('backup:run')->dailyAt('02:30')->withoutOverlapping()->onFailure(fn () => report(new RuntimeException('The nightly backup failed; see the log.')));
