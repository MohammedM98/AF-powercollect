<?php

namespace App\Providers;

use App\Models\ReadingEntrySetting;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Read by every reading-week calculation, so loaded once per request or job.
        $this->app->scoped(ReadingEntrySetting::class, fn (): ReadingEntrySetting => ReadingEntrySetting::loadCurrent());
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
