<?php

use App\Http\Controllers\AreaController;
use App\Http\Controllers\BranchController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\MeterBoxController;
use App\Http\Controllers\PermissionController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\SubscriberController;
use App\Http\Controllers\TariffController;
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
    Route::resource('tariffs', TariffController::class)->only(['index', 'create', 'store', 'edit', 'update']);
    Route::resource('meter-boxes', MeterBoxController::class)->only(['index', 'create', 'store', 'edit', 'update']);
    Route::resource('areas', AreaController::class)->only(['index', 'create', 'store', 'edit', 'update']);

    Route::get('/settings/permissions', [PermissionController::class, 'edit'])->name('settings.permissions.edit');
    Route::put('/settings/permissions', [PermissionController::class, 'update'])->name('settings.permissions.update');
});

require __DIR__.'/auth.php';
