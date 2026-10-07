<?php

use App\Http\Middleware\AuthenticateMobileToken;
use App\Http\Middleware\EnsureAccountIsActive;
use App\Http\Middleware\HandleInertiaRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Inertia\ExceptionResponse;
use Inertia\Inertia;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'mobile.auth' => AuthenticateMobileToken::class,
        ]);
        $middleware->web(append: [
            EnsureAccountIsActive::class,
            HandleInertiaRequests::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // No permission, not found, expired and the like are Arabic pages in the app's own layout, with a way back.
        Inertia::handleExceptionsUsing(function (ExceptionResponse $response) {
            $showsPage = in_array($response->statusCode(), [403, 404, 419, 429], true)
                || (in_array($response->statusCode(), [500, 503], true) && ! config('app.debug'));

            if ($showsPage && ! $response->request->is('api/*') && ! $response->request->expectsJson()) {
                return $response->render('Error', ['status' => $response->statusCode()])->withSharedData();
            }
        });
    })->create();
