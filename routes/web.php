<?php

use App\Http\Controllers\AreaController;
use App\Http\Controllers\BranchController;
use App\Http\Controllers\CircuitBreakerController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\GovernorateController;
use App\Http\Controllers\MeterBoxController;
use App\Http\Controllers\MeterReadingController;
use App\Http\Controllers\PermissionController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ReadingScheduleController;
use App\Http\Controllers\ReadNotificationController;
use App\Http\Controllers\SubAreaController;
use App\Http\Controllers\SubscriberController;
use App\Http\Controllers\SubscriberPaymentController;
use App\Http\Controllers\SubscriberStatementController;
use App\Http\Controllers\TariffController;
use App\Http\Controllers\TariffSegmentController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/dashboard', [DashboardController::class, 'index'])->middleware('auth')->name('dashboard');

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');

    Route::resource('branches', BranchController::class)->only(['index', 'create', 'store', 'edit', 'update']);
    Route::resource('users', UserController::class)->only(['index', 'create', 'store', 'edit', 'update']);
    Route::resource('subscribers', SubscriberController::class)->only(['index', 'create', 'store', 'edit', 'update']);
    Route::get('/subscribers/{subscriber}/statement', [SubscriberStatementController::class, 'show'])->name('subscribers.statement');
    Route::post('/subscribers/{subscriber}/payments', [SubscriberPaymentController::class, 'store'])->name('subscribers.payments.store');
    Route::resource('tariffs', TariffController::class)->only(['index', 'create', 'store', 'edit', 'update']);
    Route::resource('tariff-segments', TariffSegmentController::class)->only(['store', 'update']);
    Route::resource('circuit-breakers', CircuitBreakerController::class)->only(['index', 'create', 'store', 'edit', 'update']);
    Route::resource('meter-boxes', MeterBoxController::class)->only(['index', 'create', 'store', 'edit', 'update']);
    Route::resource('meter-readings', MeterReadingController::class)->only(['index', 'store', 'update']);
    Route::post('/meter-readings/approve', [MeterReadingController::class, 'approve'])->name('meter-readings.approve');
    Route::resource('areas', AreaController::class)->only(['create', 'store', 'edit', 'update']);
    Route::resource('sub-areas', SubAreaController::class)->only(['create', 'store', 'edit', 'update']);
    Route::resource('governorates', GovernorateController::class)->only(['index', 'create', 'store', 'edit', 'update']);

    Route::get('/settings/permissions', [PermissionController::class, 'edit'])->name('settings.permissions.edit');
    Route::put('/settings/permissions', [PermissionController::class, 'update'])->name('settings.permissions.update');
    Route::get('/settings/reading-schedule', [ReadingScheduleController::class, 'edit'])->name('settings.reading-schedule.edit');
    Route::put('/settings/reading-schedule', [ReadingScheduleController::class, 'update'])->name('settings.reading-schedule.update');

    Route::post('/notifications/read', [ReadNotificationController::class, 'store'])->name('notifications.read');
});

require __DIR__.'/auth.php';
