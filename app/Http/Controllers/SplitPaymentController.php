<?php

namespace App\Http\Controllers;

use App\Enums\PermissionKey;
use App\Http\Requests\StoreSplitPaymentRequest;
use App\Models\SplitPayment;
use App\Models\SubscriptionTransaction;
use App\Notifications\ActionCompleted;
use App\Support\DailySeries;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;

class SplitPaymentController extends Controller
{
    /**
     * Record one bank transfer divided between several subscriptions: a
     * payment on each, all together or none. The payments page shows what was
     * recorded, with each part's receipt.
     */
    public function store(StoreSplitPaymentRequest $request): RedirectResponse
    {
        $actor = $request->user();
        $split = SplitPayment::record($actor, $request->safe()->except('parts'), $request->parts());
        $payments = $split->payments()->with('subscription')->get();

        $actor->notify(new ActionCompleted(
            'split-payment-recorded',
            sprintf('%s — %s شيكل على %d مشتركين', $split->sender_name, SubscriptionTransaction::formatAmount($split->total_amount), $payments->count()),
        ));

        Inertia::flash('recordedSplitPayment', [
            'id' => $split->id,
            'total' => SubscriptionTransaction::formatAmount($split->total_amount),
            'reference' => $split->reference_number,
            'bankName' => $split->bank_name,
            'senderName' => $split->sender_name,
            'parts' => $payments->map(fn (SubscriptionTransaction $payment): array => [
                'subscriptionName' => $payment->subscription->displayName(),
                'accountNumber' => $payment->subscription->account_number,
                'amount' => SubscriptionTransaction::formatAmount(ltrim($payment->amount, '-')),
                'balance' => number_format($payment->subscription->balance(), 2, '.', ''),
                'receiptUrl' => route('subscriptions.payments.receipt', [$payment->subscription, $payment]),
            ])->values()->all(),
        ]);

        return back()->with('status', 'split-payment-recorded');
    }

    /**
     * A split transfer's details, as the statement, the ledger and the closing
     * show them: what was transferred, who sent it, and the parts it became.
     * A user sees the parts of their own branch's subscriptions (all of them,
     * for the Super Admin and those who review every branch's closings); the
     * others are only counted.
     */
    public function show(Request $request, SplitPayment $splitPayment): JsonResponse
    {
        $this->authorize('view', $splitPayment);

        $actor = $request->user();
        $seesEveryBranch = $actor->isSuperAdmin() || $actor->hasPermission(PermissionKey::ViewAllClosings) || $actor->hasPermission(PermissionKey::AuditClosings);
        $payments = $splitPayment->payments()->with(['subscription', 'cancelledBy'])->get();
        [$visible, $hidden] = $payments->partition(fn (SubscriptionTransaction $payment): bool => $seesEveryBranch || $payment->subscription->branch_id === $actor->branch_id);
        $standingTotal = $splitPayment->standingTotal();

        return response()->json([
            'id' => $splitPayment->id,
            'total' => SubscriptionTransaction::formatAmount($splitPayment->total_amount),
            'standingTotal' => SubscriptionTransaction::formatAmount($standingTotal),
            // Every part still stands and together they are what was transferred.
            'isComplete' => (int) round((float) $standingTotal * 100) === (int) round((float) $splitPayment->total_amount * 100),
            'bankName' => $splitPayment->bank_name,
            'senderName' => $splitPayment->sender_name,
            'referenceNumber' => $splitPayment->reference_number,
            'recordedByName' => $splitPayment->recordedBy?->name,
            'date' => DailySeries::localDate($splitPayment->created_at),
            'time' => DailySeries::localTime($splitPayment->created_at),
            'partsCount' => $payments->count(),
            'parts' => $visible->map(fn (SubscriptionTransaction $payment): array => [
                'id' => $payment->id,
                'subscriptionName' => $payment->subscription->displayName(),
                'accountNumber' => $payment->subscription->account_number,
                'amount' => SubscriptionTransaction::formatAmount(ltrim($payment->amount, '-')),
                'isCancelled' => $payment->isCancelled(),
                'cancellationLabel' => $payment->cancellation_reason ? __($payment->cancellation_reason->label()) : null,
                'receiptUrl' => $actor->can('view', $payment->subscription) || $actor->can('recordPayment', $payment->subscription)
                    ? route('subscriptions.payments.receipt', [$payment->subscription, $payment])
                    : null,
            ])->values()->all(),
            'hiddenPartsCount' => $hidden->count(),
            'hiddenPartsAmount' => SubscriptionTransaction::formatAmount($hidden->reject(fn (SubscriptionTransaction $payment): bool => $payment->isCancelled())->sum(fn (SubscriptionTransaction $payment): float => -(float) $payment->amount)),
        ]);
    }
}
