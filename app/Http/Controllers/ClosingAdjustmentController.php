<?php

namespace App\Http\Controllers;

use App\Enums\PermissionKey;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Support\ClosingAdjustmentService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ClosingAdjustmentController extends Controller
{
    public function store(Request $request, Subscription $subscription, SubscriptionTransaction $transaction, ClosingAdjustmentService $service): RedirectResponse
    {
        $this->authorize('view', $subscription);
        abort_unless($transaction->subscription_id === $subscription->id, 404);
        $permission = $request->input('adjustment_type') === 'reverse' ? PermissionKey::CreateClosingReversals : PermissionKey::CreateClosingAdjustments;
        abort_unless($request->user()->hasPermission($permission), 403);
        $validated = $request->validate([
            'adjustment_type' => ['required', Rule::in(['correction', 'reverse'])],
            'amount' => ['required_if:adjustment_type,correction', 'prohibited_if:adjustment_type,reverse', 'nullable', 'numeric', 'decimal:0,2', 'min:0', 'max:1000000'],
            'reason' => ['required', 'string', 'max:1000'],
        ]);
        $service->adjust($transaction, $request->user(), $validated['adjustment_type'], $validated['amount'] ?? null, $validated['reason']);

        return back()->with('status', 'transaction-corrected');
    }
}
