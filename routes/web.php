<?php

use App\Http\Controllers\AreaController;
use App\Http\Controllers\BranchController;
use App\Http\Controllers\BranchPerformanceController;
use App\Http\Controllers\CashTransferController;
use App\Http\Controllers\CircuitBreakerController;
use App\Http\Controllers\ClosingController;
use App\Http\Controllers\ClosingScheduleController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\GovernorateController;
use App\Http\Controllers\LedgerController;
use App\Http\Controllers\MessageController;
use App\Http\Controllers\MessageTemplateController;
use App\Http\Controllers\MeterBoxController;
use App\Http\Controllers\MeterReadingController;
use App\Http\Controllers\PeriodClosingController;
use App\Http\Controllers\PermissionController;
use App\Http\Controllers\PrintTemplateController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ProfileDeviceController;
use App\Http\Controllers\ReadingScheduleController;
use App\Http\Controllers\ReadNotificationController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\SubAreaController;
use App\Http\Controllers\SubscriberBulkChangeController;
use App\Http\Controllers\SubscriberChargeController;
use App\Http\Controllers\SubscriberClearingController;
use App\Http\Controllers\SubscriberController;
use App\Http\Controllers\SubscriberDiscountController;
use App\Http\Controllers\SubscriberPaymentController;
use App\Http\Controllers\SubscriberPhoneController;
use App\Http\Controllers\SubscriberStandingDiscountController;
use App\Http\Controllers\SubscriberStatementController;
use App\Http\Controllers\SubscriberTransactionController;
use App\Http\Controllers\TariffController;
use App\Http\Controllers\TariffSegmentController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\UserTypeController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/dashboard', [DashboardController::class, 'index'])->middleware('auth')->name('dashboard');

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile/devices', [ProfileDeviceController::class, 'destroy'])->middleware('throttle:6,1')->name('profile.devices.destroy');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');

    Route::get('/ledger', [LedgerController::class, 'index'])->name('ledger.index');

    Route::get('/closings', [ClosingController::class, 'index'])->name('closings.index');
    Route::get('/closings/register.csv', [ClosingController::class, 'export'])->name('closings.export');
    Route::get('/settings/closing-schedule', [ClosingScheduleController::class, 'edit'])->name('settings.closing-schedule.edit');
    Route::put('/settings/closing-schedule', [ClosingScheduleController::class, 'update'])->name('settings.closing-schedule.update');
    Route::post('/settings/closing-schedule/open', [ClosingScheduleController::class, 'open'])->name('settings.closing-schedule.open');
    Route::put('/closings/{closing}/count', [ClosingController::class, 'count'])->name('closings.count');
    Route::put('/closings/{closing}/lines/{line}', [ClosingController::class, 'match'])->name('closings.lines.match');
    Route::post('/closings/{closing}/submit', [ClosingController::class, 'submit'])->name('closings.submit');
    Route::post('/closings/{closing}/return', [ClosingController::class, 'returnForCorrection'])->name('closings.return');
    Route::post('/closings/{closing}/approve', [ClosingController::class, 'approve'])->name('closings.approve');
    Route::post('/closings/{closing}/transfers', [CashTransferController::class, 'store'])->name('closings.transfers.store');
    Route::post('/cash-transfers/{transfer}/receive', [CashTransferController::class, 'receive'])->name('cash-transfers.receive');
    Route::get('/cash-transfers/{transfer}/proof', [CashTransferController::class, 'proof'])->name('cash-transfers.proof');
    Route::post('/period-closings', [PeriodClosingController::class, 'store'])->name('period-closings.store');
    Route::get('/reports', [ReportController::class, 'index'])->name('reports.index');
    Route::get('/reports/lines.csv', [ReportController::class, 'export'])->name('reports.export');
    Route::get('/branch-performance', [BranchPerformanceController::class, 'index'])->name('branch-performance.index');
    Route::get('/branch-performance/{branch}', [BranchPerformanceController::class, 'show'])->name('branch-performance.show');

    Route::resource('branches', BranchController::class)->only(['index', 'create', 'store', 'edit', 'update', 'destroy']);
    Route::resource('user-types', UserTypeController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::resource('users', UserController::class)->only(['index', 'create', 'store', 'edit', 'update', 'destroy']);
    Route::get('/subscribers/bulk-changes', [SubscriberBulkChangeController::class, 'index'])->name('subscribers.bulk-changes.index');
    Route::post('/subscribers/bulk-changes', [SubscriberBulkChangeController::class, 'store'])->name('subscribers.bulk-changes.store');
    Route::post('/subscribers/bulk-changes/{change}/undo', [SubscriberBulkChangeController::class, 'undo'])->name('subscribers.bulk-changes.undo');
    Route::patch('/subscribers/{subscriber}/phone', [SubscriberPhoneController::class, 'update'])->name('subscribers.phone.update');
    Route::resource('subscribers', SubscriberController::class)->only(['index', 'create', 'store', 'edit', 'update', 'destroy']);
    Route::get('/subscribers/{subscriber}/statement', [SubscriberStatementController::class, 'show'])->name('subscribers.statement');
    Route::post('/subscribers/{subscriber}/payments', [SubscriberPaymentController::class, 'store'])->name('subscribers.payments.store');
    Route::post('/subscribers/{subscriber}/charges', [SubscriberChargeController::class, 'store'])->name('subscribers.charges.store');
    Route::post('/subscribers/{subscriber}/discounts', [SubscriberDiscountController::class, 'store'])->name('subscribers.discounts.store');
    Route::post('/subscribers/{subscriber}/clearings', [SubscriberClearingController::class, 'store'])->name('subscribers.clearings.store');
    Route::put('/subscribers/{subscriber}/transactions/{transaction}', [SubscriberTransactionController::class, 'update'])->scopeBindings()->name('subscribers.transactions.update');
    Route::delete('/subscribers/{subscriber}/transactions/{transaction}', [SubscriberTransactionController::class, 'destroy'])->scopeBindings()->name('subscribers.transactions.destroy');
    Route::put('/subscribers/{subscriber}/standing-discount', [SubscriberStandingDiscountController::class, 'update'])->name('subscribers.standing-discount.update');
    Route::delete('/subscribers/{subscriber}/standing-discount', [SubscriberStandingDiscountController::class, 'destroy'])->name('subscribers.standing-discount.destroy');
    Route::resource('tariffs', TariffController::class)->only(['index', 'create', 'store', 'edit', 'update', 'destroy']);
    Route::resource('tariff-segments', TariffSegmentController::class)->only(['store', 'update', 'destroy']);
    Route::resource('circuit-breakers', CircuitBreakerController::class)->only(['index', 'create', 'store', 'edit', 'update', 'destroy']);
    Route::resource('meter-boxes', MeterBoxController::class)->only(['index', 'create', 'store', 'edit', 'update', 'destroy']);
    Route::resource('meter-readings', MeterReadingController::class)->only(['index', 'store', 'update']);
    Route::post('/meter-readings/approve', [MeterReadingController::class, 'approve'])->name('meter-readings.approve');
    Route::resource('areas', AreaController::class)->only(['create', 'store', 'edit', 'update', 'destroy']);
    Route::resource('sub-areas', SubAreaController::class)->only(['create', 'store', 'edit', 'update', 'destroy']);
    Route::resource('governorates', GovernorateController::class)->only(['index', 'create', 'store', 'edit', 'update', 'destroy']);

    Route::get('/settings/permissions', [PermissionController::class, 'edit'])->name('settings.permissions.edit');
    Route::put('/settings/permissions', [PermissionController::class, 'update'])->name('settings.permissions.update');
    Route::get('/settings/print-templates', [PrintTemplateController::class, 'index'])->name('settings.print-templates.index');
    Route::post('/print-templates', [PrintTemplateController::class, 'store'])->name('print-templates.store');
    Route::put('/print-templates/{print_template}', [PrintTemplateController::class, 'update'])->name('print-templates.update');
    Route::post('/print-templates/{print_template}/duplicate', [PrintTemplateController::class, 'duplicate'])->name('print-templates.duplicate');
    Route::delete('/print-templates/{print_template}', [PrintTemplateController::class, 'destroy'])->name('print-templates.destroy');
    Route::get('/settings/reading-schedule', [ReadingScheduleController::class, 'edit'])->name('settings.reading-schedule.edit');
    Route::put('/settings/reading-schedule', [ReadingScheduleController::class, 'update'])->name('settings.reading-schedule.update');

    Route::get('/messages', [MessageController::class, 'index'])->name('messages.index');
    Route::get('/messages/create', [MessageController::class, 'create'])->name('messages.create');
    Route::post('/messages', [MessageController::class, 'store'])->middleware('throttle:20,1')->name('messages.store');
    Route::get('/messages/{batch}', [MessageController::class, 'show'])->name('messages.show');
    Route::post('/messages/{batch}/retry', [MessageController::class, 'retry'])->name('messages.retry');
    Route::put('/messages/{batch}/messages/{message}/sent', [MessageController::class, 'markSent'])->scopeBindings()->name('messages.sent');
    Route::resource('message-templates', MessageTemplateController::class)->only(['store', 'update', 'destroy']);

    Route::post('/notifications/read', [ReadNotificationController::class, 'store'])->name('notifications.read');
});

require __DIR__.'/auth.php';
