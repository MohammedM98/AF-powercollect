<?php

use App\Http\Controllers\AreaController;
use App\Http\Controllers\BranchController;
use App\Http\Controllers\BranchPerformanceController;
use App\Http\Controllers\CashTransferController;
use App\Http\Controllers\CircuitBreakerController;
use App\Http\Controllers\ClosingAdjustmentController;
use App\Http\Controllers\ClosingController;
use App\Http\Controllers\ClosingScheduleController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\FinancialAuditController;
use App\Http\Controllers\GovernorateController;
use App\Http\Controllers\LedgerController;
use App\Http\Controllers\MessageController;
use App\Http\Controllers\MessageTemplateController;
use App\Http\Controllers\MeterBoxController;
use App\Http\Controllers\MeterBoxOptionController;
use App\Http\Controllers\MeterBoxSubscriptionController;
use App\Http\Controllers\MeterReadingController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\PeriodClosingController;
use App\Http\Controllers\PermissionController;
use App\Http\Controllers\PrintTemplateController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ProfileDeviceController;
use App\Http\Controllers\ReadingScheduleController;
use App\Http\Controllers\ReadNotificationController;
use App\Http\Controllers\ReceivableController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\SplitPaymentController;
use App\Http\Controllers\SubAreaController;
use App\Http\Controllers\SubscriberProfileHistoryController;
use App\Http\Controllers\SubscriptionBulkChangeController;
use App\Http\Controllers\SubscriptionChargeController;
use App\Http\Controllers\SubscriptionClearingController;
use App\Http\Controllers\SubscriptionController;
use App\Http\Controllers\SubscriptionDiscountController;
use App\Http\Controllers\SubscriptionPaymentController;
use App\Http\Controllers\SubscriptionPersonalDetailsController;
use App\Http\Controllers\SubscriptionPhoneController;
use App\Http\Controllers\SubscriptionSearchController;
use App\Http\Controllers\SubscriptionStandingDiscountController;
use App\Http\Controllers\SubscriptionStatementController;
use App\Http\Controllers\SubscriptionTransactionController;
use App\Http\Controllers\TariffController;
use App\Http\Controllers\TariffSegmentController;
use App\Http\Controllers\TransactionAuditController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\UserTypeController;
use App\Http\Controllers\WeeklyClosingAuditController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/dashboard', [DashboardController::class, 'index'])->middleware('auth')->name('dashboard');

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile/devices', [ProfileDeviceController::class, 'destroy'])->middleware('throttle:6,1')->name('profile.devices.destroy');

    Route::get('/search/subscriptions', [SubscriptionSearchController::class, 'index'])->middleware('throttle:60,1')->name('search.subscriptions');

    Route::get('/payments', [PaymentController::class, 'index'])->name('payments.index');
    Route::get('/payments/search', [PaymentController::class, 'search'])->name('payments.search');
    Route::post('/payments/split', [SplitPaymentController::class, 'store'])->name('payments.split.store');
    Route::get('/split-payments/{splitPayment}', [SplitPaymentController::class, 'show'])->name('split-payments.show');
    Route::get('/ledger', [LedgerController::class, 'index'])->name('ledger.index');
    Route::get('/receivables', [ReceivableController::class, 'index'])->name('receivables.index');
    Route::get('/transaction-audit', [TransactionAuditController::class, 'index'])->name('transaction-audit.index');

    Route::get('/closings', [ClosingController::class, 'index'])->name('closings.index');
    Route::get('/financial-audit', [FinancialAuditController::class, 'index'])->name('financial-audit.index');
    Route::get('/closings/audit-statements', [FinancialAuditController::class, 'branchIndex'])->name('financial-audit.branch');
    Route::post('/financial-audit/statements', [FinancialAuditController::class, 'store'])->name('financial-audit.store');
    Route::get('/financial-audit/statements/{statement}', [FinancialAuditController::class, 'show'])->name('financial-audit.show');
    Route::put('/financial-audit/statements/{statement}/lines/{line}', [FinancialAuditController::class, 'review'])->name('financial-audit.review');
    Route::post('/financial-audit/statements/{statement}/lines/{line}/response', [FinancialAuditController::class, 'respond'])->name('financial-audit.respond');
    Route::post('/financial-audit/statements/{statement}/approve', [FinancialAuditController::class, 'approve'])->name('financial-audit.approve');
    Route::post('/closings/{closing}/branch-approve', [FinancialAuditController::class, 'approveBranch'])->name('closings.branch-approve');
    Route::post('/closings/{closing}/branch-return', [FinancialAuditController::class, 'returnToPreparer'])->name('closings.branch-return');
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
    Route::put('/closing-periods/{period}/audit', [WeeklyClosingAuditController::class, 'update'])->name('closing-periods.audit');
    Route::post('/subscriptions/{subscription}/transactions/{transaction}/closing-adjustments', [ClosingAdjustmentController::class, 'store'])->scopeBindings()->name('closing-adjustments.store');
    Route::get('/reports', [ReportController::class, 'index'])->name('reports.index');
    Route::get('/reports/lines.csv', [ReportController::class, 'export'])->name('reports.export');
    Route::get('/branch-performance', [BranchPerformanceController::class, 'index'])->name('branch-performance.index');
    Route::get('/branch-performance/{branch}', [BranchPerformanceController::class, 'show'])->name('branch-performance.show');

    Route::resource('branches', BranchController::class)->only(['index', 'create', 'store', 'edit', 'update', 'destroy']);
    Route::resource('user-types', UserTypeController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::resource('users', UserController::class)->only(['index', 'create', 'store', 'edit', 'update', 'destroy']);
    Route::get('/subscriptions/bulk-changes', [SubscriptionBulkChangeController::class, 'index'])->name('subscriptions.bulk-changes.index');
    Route::post('/subscriptions/bulk-changes', [SubscriptionBulkChangeController::class, 'store'])->name('subscriptions.bulk-changes.store');
    Route::post('/subscriptions/bulk-changes/{change}/undo', [SubscriptionBulkChangeController::class, 'undo'])->name('subscriptions.bulk-changes.undo');
    Route::patch('/subscriptions/{subscription}/phone', [SubscriptionPhoneController::class, 'update'])->name('subscriptions.phone.update');
    Route::patch('/subscriptions/{subscription}/personal-details', [SubscriptionPersonalDetailsController::class, 'update'])->name('subscriptions.personal-details.update');
    Route::get('/subscriptions/{subscription}/personal-details/history', [SubscriberProfileHistoryController::class, 'show'])->name('subscriptions.personal-details.history');
    Route::resource('subscriptions', SubscriptionController::class)->only(['index', 'create', 'store', 'edit', 'update', 'destroy']);
    Route::get('/subscriptions/{subscription}/statement', [SubscriptionStatementController::class, 'show'])->name('subscriptions.statement');
    Route::get('/subscriptions/{subscription}/payments/reference-status', [SubscriptionPaymentController::class, 'referenceStatus'])->name('subscriptions.payments.reference-status');
    Route::post('/subscriptions/{subscription}/payments', [SubscriptionPaymentController::class, 'store'])->name('subscriptions.payments.store');
    Route::get('/subscriptions/{subscription}/payments/{transaction}/receipt', [SubscriptionPaymentController::class, 'receipt'])->scopeBindings()->name('subscriptions.payments.receipt');
    Route::post('/subscriptions/{subscription}/charges', [SubscriptionChargeController::class, 'store'])->name('subscriptions.charges.store');
    Route::post('/subscriptions/{subscription}/discounts', [SubscriptionDiscountController::class, 'store'])->name('subscriptions.discounts.store');
    Route::post('/subscriptions/{subscription}/clearings', [SubscriptionClearingController::class, 'store'])->name('subscriptions.clearings.store');
    Route::post('/subscriptions/{subscription}/transactions/{transaction}/actions', [SubscriptionTransactionController::class, 'apply'])->scopeBindings()->name('subscriptions.transactions.actions.store');
    Route::patch('/subscriptions/{subscription}/transactions/{transaction}/details', [SubscriptionTransactionController::class, 'amend'])->scopeBindings()->name('subscriptions.transactions.amend');
    Route::put('/subscriptions/{subscription}/transactions/{transaction}', [SubscriptionTransactionController::class, 'update'])->scopeBindings()->name('subscriptions.transactions.update');
    Route::delete('/subscriptions/{subscription}/transactions/{transaction}', [SubscriptionTransactionController::class, 'destroy'])->scopeBindings()->name('subscriptions.transactions.destroy');
    Route::delete('/subscriptions/{subscription}/transactions/{transaction}/permanent', [SubscriptionTransactionController::class, 'forceDestroy'])->scopeBindings()->name('subscriptions.transactions.force-destroy');
    Route::put('/subscriptions/{subscription}/standing-discount', [SubscriptionStandingDiscountController::class, 'update'])->name('subscriptions.standing-discount.update');
    Route::delete('/subscriptions/{subscription}/standing-discount', [SubscriptionStandingDiscountController::class, 'destroy'])->name('subscriptions.standing-discount.destroy');
    Route::resource('tariffs', TariffController::class)->only(['index', 'create', 'store', 'edit', 'update', 'destroy']);
    Route::resource('tariff-segments', TariffSegmentController::class)->only(['store', 'update', 'destroy']);
    Route::resource('circuit-breakers', CircuitBreakerController::class)->only(['index', 'create', 'store', 'edit', 'update', 'destroy']);
    Route::resource('meter-boxes', MeterBoxController::class)->only(['index', 'create', 'store', 'edit', 'update', 'destroy']);
    Route::get('/meter-boxes/options', [MeterBoxOptionController::class, 'index'])->name('meter-boxes.options');
    Route::get('/meter-boxes/{meter_box}/subscriptions', [MeterBoxSubscriptionController::class, 'index'])->name('meter-boxes.subscriptions.index');
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

// An address that matches nothing (outside the mobile API) is still answered inside the web group, so a signed-in
// user's 404 page knows who they are. Any method is caught, so a real address asked with a wrong one stays a 405.
Route::any('{fallbackPlaceholder}', function (Request $request) {
    $allowed = collect(Route::getRoutes()->getRoutes())
        ->reject(fn ($route) => $route->isFallback)
        ->filter(fn ($route) => $route->matches($request, false))
        ->flatMap(fn ($route) => $route->methods())
        ->unique()
        ->values();

    abort_if($allowed->isNotEmpty(), 405, headers: ['Allow' => $allowed->implode(', ')]);
    abort(404);
})->where('fallbackPlaceholder', '(?!api(?:/|$)).*')->fallback();
