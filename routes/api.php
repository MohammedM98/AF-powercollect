<?php

use App\Http\Controllers\Mobile\MobileCollectionController;
use App\Http\Controllers\Mobile\MobileReadingController;
use App\Http\Controllers\Mobile\MobileSessionController;
use App\Http\Controllers\Mobile\MobileSubscriptionController;
use Illuminate\Support\Facades\Route;

Route::prefix('mobile')->name('mobile.')->group(function (): void {
    Route::post('/login', [MobileSessionController::class, 'store'])->name('login');

    Route::middleware('mobile.auth')->group(function (): void {
        Route::get('/me', [MobileSessionController::class, 'show'])->name('me');
        Route::post('/logout', [MobileSessionController::class, 'destroy'])->name('logout');
        Route::get('/subscriptions', [MobileSubscriptionController::class, 'index'])->name('subscriptions.index');
        Route::post('/readings', [MobileReadingController::class, 'store'])->name('readings.store');
        Route::get('/readings', [MobileReadingController::class, 'index'])->name('readings.index');
        Route::get('/collections/subscriptions', [MobileCollectionController::class, 'subscriptions'])->name('collections.subscriptions');
        Route::get('/collections/subscriptions/{subscription}', [MobileCollectionController::class, 'show'])->whereNumber('subscription')->name('collections.subscriptions.show');
        Route::get('/collections', [MobileCollectionController::class, 'index'])->name('collections.index');
        Route::post('/collections', [MobileCollectionController::class, 'store'])->name('collections.store');
    });
});
