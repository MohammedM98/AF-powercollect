<?php

namespace App\Providers;

use App\Models\ClosingSetting;
use App\Models\ReadingEntrySetting;
use App\Support\Messaging\HttpSmsGateway;
use App\Support\Messaging\LogSmsGateway;
use App\Support\Messaging\SmsGateway;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Read by every reading-week calculation, so loaded once per request or job.
        $this->app->scoped(ReadingEntrySetting::class, fn (): ReadingEntrySetting => ReadingEntrySetting::loadCurrent());
        $this->app->scoped(ClosingSetting::class, fn (): ClosingSetting => ClosingSetting::loadCurrent());

        // SMS go out through the gateway named in services.sms.driver; until one is set up they're only logged.
        $this->app->bind(SmsGateway::class, fn (): SmsGateway => match (config('services.sms.driver')) {
            'http' => new HttpSmsGateway(config('services.sms.http'), (string) config('services.sms.country_code')),
            default => new LogSmsGateway,
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Every password — a new user's, a user's own — is at least ten characters with letters and numbers; in
        // production it also must not be in a known breach (a check that calls out to a service, so not in tests).
        Password::defaults(fn (): Password => $this->app->isProduction()
            ? Password::min(10)->letters()->numbers()->uncompromised()
            : Password::min(10)->letters()->numbers());
    }
}
