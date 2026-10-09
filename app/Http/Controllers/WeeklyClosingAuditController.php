<?php

namespace App\Http\Controllers;

use App\Enums\ClosingPeriodStatus;
use App\Enums\PermissionKey;
use App\Models\Closing;
use App\Models\ClosingPeriod;
use App\Support\WeeklyClosingService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class WeeklyClosingAuditController extends Controller
{
    public function update(Request $request, ClosingPeriod $period, WeeklyClosingService $service): RedirectResponse
    {
        $validated = $request->validate([
            'action' => ['required', Rule::in(['prepare', 'send_to_audit', 'mark_audited'])],
            'notes' => ['nullable', 'string', 'max:2000'],
            'counted_cash' => ['required_if:action,mark_audited', 'nullable', 'numeric', 'decimal:0,2', 'min:0', 'max:100000000'],
            'verified_bank' => ['required_if:action,mark_audited', 'nullable', 'numeric', 'decimal:0,2', 'min:0', 'max:100000000'],
            'verified_wallets' => ['required_if:action,mark_audited', 'nullable', 'numeric', 'decimal:0,2', 'min:0', 'max:100000000'],
            'verified_other' => ['required_if:action,mark_audited', 'nullable', 'numeric', 'decimal:0,2', 'min:0', 'max:100000000'],
        ]);
        $actor = $request->user();
        if ($validated['action'] === 'prepare') {
            Gate::authorize('closeWeek', Closing::class);
        } else {
            abort_unless($actor->hasPermission($validated['action'] === 'mark_audited' ? PermissionKey::MarkClosingsAudited : PermissionKey::AuditClosings), 403);
        }
        DB::transaction(function () use ($service, $period, $actor, $validated): void {
            $service->lock();
            $period->refresh();
            if ($validated['action'] === 'prepare') {
                if (now()->lessThan($period->cutoff_at) || $period->status->isClosed()) {
                    throw ValidationException::withMessages(['period' => 'لا يمكن إعداد هذه الفترة الآن.']);
                }
                $service->prepare($period, $actor);

                return;
            }
            $expectedStatus = $validated['action'] === 'send_to_audit' ? ClosingPeriodStatus::Closed : ClosingPeriodStatus::UnderAudit;
            if ($period->status !== $expectedStatus || $period->closing?->snapshot === null) {
                throw ValidationException::withMessages(['period' => 'حالة الفترة أو لقطة الإغلاق لا تسمح بهذا الإجراء.']);
            }
            $reconciliation = null;
            if ($validated['action'] === 'mark_audited') {
                $report = $period->closing->snapshot['report'];
                $reconciliation = [];
                foreach (['cash' => ['cashTotal', 'counted_cash'], 'bank' => ['bankTotal', 'verified_bank'], 'wallets' => ['walletTotal', 'verified_wallets'], 'other' => ['otherTotal', 'verified_other']] as $channel => [$expected, $verified]) {
                    $difference = Closing::cents($validated[$verified]) - Closing::cents($report[$expected]);
                    $reconciliation[$channel] = ['expected' => $report[$expected], 'verified' => Closing::money(Closing::cents($validated[$verified])), 'difference' => Closing::money($difference)];
                    if ($difference !== 0 && trim($validated['notes'] ?? '') === '') {
                        throw ValidationException::withMessages(['notes' => 'وثّق سبب فروق المطابقة قبل إنهاء التدقيق.']);
                    }
                }
            }
            $period->update(['status' => $validated['action'] === 'send_to_audit' ? ClosingPeriodStatus::UnderAudit : ClosingPeriodStatus::Audited,
                'reconciliation' => $reconciliation, 'audit_notes' => $validated['notes'] ?? null, 'reviewed_by' => $actor->id, 'reviewed_at' => now()]);
            $period->closing->record($actor, $validated['action'] === 'send_to_audit' ? 'PERIOD_SENT_TO_AUDIT' : 'PERIOD_AUDITED', $validated['notes'] ?? 'تم تحديث حالة التدقيق.');
        });

        return back();
    }
}
