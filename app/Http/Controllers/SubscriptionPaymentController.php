<?php

namespace App\Http\Controllers;

use App\Enums\Currency;
use App\Http\Requests\StoreSubscriptionPaymentRequest;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Notifications\ActionCompleted;
use App\Support\DailySeries;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class SubscriptionPaymentController extends Controller
{
    /** Check a transfer reference while the collector is still filling the form. */
    public function referenceStatus(Request $request, Subscription $subscription): JsonResponse
    {
        $this->authorize('recordPayment', $subscription);

        $validated = $request->validate([
            'reference_number' => ['required', 'string', 'max:100'],
            'ignore_transaction_id' => ['nullable', 'integer'],
            'amount' => ['nullable', 'numeric', 'gt:0'],
            'currency' => ['nullable', 'string', 'max:3'],
            'sender_name' => ['nullable', 'string', 'max:255'],
        ]);
        $ignoreId = isset($validated['ignore_transaction_id']) ? (int) $validated['ignore_transaction_id'] : null;
        $conflict = SubscriptionTransaction::activeReferenceConflict($validated['reference_number'], $ignoreId);
        $warning = null;

        if (! $conflict && isset($validated['amount'], $validated['currency'], $validated['sender_name'])) {
            $possibleDuplicate = SubscriptionTransaction::query()
                ->where('type', SubscriptionTransaction::TYPE_PAYMENT)
                ->whereNull('cancelled_at')
                ->whereDate('created_at', today())
                ->where('currency_amount', $validated['amount'])
                ->where('currency', $validated['currency'])
                ->where('sender_name', trim($validated['sender_name']))
                ->when($ignoreId, fn ($query) => $query->whereKeyNot($ignoreId))
                ->latest('id')
                ->first();

            if ($possibleDuplicate) {
                $warning = $this->referenceTransactionData($possibleDuplicate);
            }
        }

        return response()->json([
            'available' => $conflict === null,
            'conflict' => $conflict ? $this->referenceTransactionData($conflict) : null,
            'warning' => $warning,
        ]);
    }

    /**
     * Record a payment on the subscription's account; it lowers the balance
     * straight away. The payment form's receipt gets the voucher number
     * it was given and the balance it left.
     */
    public function store(StoreSubscriptionPaymentRequest $request, Subscription $subscription): RedirectResponse
    {
        $payment = SubscriptionTransaction::recordPayment($subscription, $request->user(), $request->validated());

        $request->user()->notify(new ActionCompleted(
            'payment-recorded',
            sprintf('%s — %s شيكل', $subscription->displayName(), SubscriptionTransaction::formatAmount(ltrim($payment->amount, '-'))),
        ));

        Inertia::flash('recordedPayment', [
            'voucherNumber' => $payment->printedVoucherNumber(),
            'balance' => number_format($subscription->balance(), 2, '.', ''),
            'receiptUrl' => route('subscriptions.payments.receipt', [$subscription, $payment]),
        ]);

        return back()->with('status', 'payment-recorded');
    }

    /**
     * A payment's receipt (سند قبض), laid out to be printed and handed to
     * the subscription: the voucher, who paid and how much, how it was paid
     * and the balance it left. A cancelled or refunded payment still prints,
     * marked as cancelled, so a copy can be reprinted for the records.
     */
    public function receipt(Request $request, Subscription $subscription, SubscriptionTransaction $transaction): InertiaResponse
    {
        $this->authorize('view', $subscription);
        abort_unless($transaction->isPayment(), 404);

        $subscription->loadMissing(['profile', 'branch', 'meterBox']);
        $transaction->loadMissing(['recordedBy', 'cancelledBy']);

        return Inertia::render('Subscriptions/PaymentReceipt', [
            'subscription' => [
                'id' => $subscription->id,
                'fullName' => $subscription->displayName(),
                'accountNumber' => $subscription->account_number,
                'subscriberNumber' => $subscription->profile?->subscriber_number,
                'phone' => $subscription->contactPhone(),
                'branchName' => $subscription->branch->name,
                'meterBoxNumber' => $subscription->meterBox?->box_number,
            ],
            'receipt' => [
                'id' => $transaction->id,
                'voucherNumber' => $transaction->displayVoucherNumber(),
                'systemVoucherNumber' => $transaction->printedVoucherNumber(),
                'manualVoucherNumber' => $transaction->manual_voucher_number,
                'date' => DailySeries::localDate($transaction->created_at),
                'time' => DailySeries::localTime($transaction->created_at),
                'amount' => SubscriptionTransaction::formatAmount($transaction->currency_amount ?? ltrim($transaction->amount, '-')),
                'currencyLabel' => __($transaction->currency->label()),
                'isShekel' => $transaction->currency === Currency::Shekel,
                'inShekels' => SubscriptionTransaction::formatAmount(ltrim($transaction->amount, '-')),
                'exchangeRate' => rtrim(rtrim($transaction->exchange_rate, '0'), '.'),
                'paymentMethodLabel' => $transaction->payment_method ? __($transaction->payment_method->label()) : null,
                'bankName' => $transaction->bank_name,
                'senderBankName' => $transaction->sender_bank_name,
                'senderName' => $transaction->sender_name,
                'referenceNumber' => $transaction->reference_number,
                'cashBox' => $transaction->cash_box,
                'notes' => $transaction->notes,
                'recordedByName' => $transaction->recordedBy?->name,
                'balanceAfter' => $transaction->balance_after,
                'cancellation' => $transaction->isCancelled() ? [
                    'reasonLabel' => $transaction->cancellation_reason ? __($transaction->cancellation_reason->label()) : null,
                    'byName' => $transaction->cancelledBy?->name,
                    'date' => $transaction->cancelled_at ? DailySeries::localDate($transaction->cancelled_at) : null,
                ] : null,
            ],
            'printedBy' => $request->user()->name,
        ]);
    }

    /** @return array{id: int, voucherNumber: ?string, subscriptionName: string, url: string} */
    private function referenceTransactionData(SubscriptionTransaction $transaction): array
    {
        $transaction->loadMissing('subscription');

        return [
            'id' => $transaction->id,
            'voucherNumber' => $transaction->displayVoucherNumber(),
            'subscriptionName' => $transaction->subscription->displayName(),
            'url' => route('subscriptions.statement', $transaction->subscription).'#statement-line-'.$transaction->id,
        ];
    }
}
