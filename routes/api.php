<?php

use App\Http\Controllers\Mobile\MobileCollectionController;
use App\Http\Controllers\Mobile\MobileReadingController;
use App\Http\Controllers\Mobile\MobileSessionController;
use App\Http\Controllers\Mobile\MobileSubscriberController;
use Illuminate\Support\Facades\Route;

Route::prefix('mobile')->name('mobile.')->group(function (): void {
    Route::post('/login', [MobileSessionController::class, 'store'])->name('login');

    Route::middleware('mobile.auth')->group(function (): void {
        Route::get('/me', [MobileSessionController::class, 'show'])->name('me');
        Route::post('/logout', [MobileSessionController::class, 'destroy'])->name('logout');
        Route::get('/subscribers', [MobileSubscriberController::class, 'index'])->name('subscribers.index');
        Route::post('/readings', [MobileReadingController::class, 'store'])->name('readings.store');
        Route::get('/readings', [MobileReadingController::class, 'index'])->name('readings.index');
        Route::get('/collections/subscribers', [MobileCollectionController::class, 'subscribers'])->name('collections.subscribers');
        Route::get('/collections/subscribers/{subscriber}', [MobileCollectionController::class, 'show'])->whereNumber('subscriber')->name('collections.subscribers.show');
        Route::get('/collections', [MobileCollectionController::class, 'index'])->name('collections.index');
        Route::post('/collections', [MobileCollectionController::class, 'store'])->name('collections.store');
    });
});
