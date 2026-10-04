<?php

namespace App\Http\Controllers;

use App\Enums\Currency;
use App\Http\Requests\StoreSubscriberPaymentRequest;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Notifications\ActionCompleted;
use App\Support\DailySeries;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class SubscriberPaymentController extends Controller
{
    /** Check a transfer reference while the collector is still filling the form. */
    public function referenceStatus(Request $request, Subscriber $subscriber): JsonResponse
    {
        $this->authorize('recordPayment', $subscriber);

        $validated = $request->validate([
            'reference_number' => ['required', 'string', 'max:100'],
            'ignore_transaction_id' => ['nullable', 'integer'],
            'amount' => ['nullable', 'numeric', 'gt:0'],
            'currency' => ['nullable', 'string', 'max:3'],
            'sender_name' => ['nullable', 'string', 'max:255'],
        ]);
        $ignoreId = isset($validated['ignore_transaction_id']) ? (int) $validated['ignore_transaction_id'] : null;
        $conflict = SubscriberTransaction::activeReferenceConflict($validated['reference_number'], $ignoreId);
        $warning = null;

        if (! $conflict && isset($validated['amount'], $validated['currency'], $validated['sender_name'])) {
            $possibleDuplicate = SubscriberTransaction::query()
                ->where('type', SubscriberTransaction::TYPE_PAYMENT)
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
     * Record a payment on the subscriber's account; it lowers the balance
     * straight away. The payment form's receipt gets the voucher number
     * it was given and the balance it left.
     */
    public function store(StoreSubscriberPaymentRequest $request, Subscriber $subscriber): RedirectResponse
    {
        $payment = SubscriberTransaction::recordPayment($subscriber, $request->user(), $request->validated());

        $request->user()->notify(new ActionCompleted(
            'payment-recorded',
            sprintf('%s — %s شيكل', $subscriber->displayName(), SubscriberTransaction::formatAmount(ltrim($payment->amount, '-'))),
        ));

        Inertia::flash('recordedPayment', [
            'voucherNumber' => $payment->printedVoucherNumber(),
            'balance' => number_format($subscriber->balance(), 2, '.', ''),
            'receiptUrl' => route('subscribers.payments.receipt', [$subscriber, $payment]),
        ]);

        return back()->with('status', 'payment-recorded');
    }

    /**
     * A payment's receipt (سند قبض), laid out to be printed and handed to
     * the subscriber: the voucher, who paid and how much, how it was paid
     * and the balance it left. A cancelled or refunded payment still prints,
     * marked as cancelled, so a copy can be reprinted for the records.
     */
    public function receipt(Request $request, Subscriber $subscriber, SubscriberTransaction $transaction): InertiaResponse
    {
        $this->authorize('view', $subscriber);
        abort_unless($transaction->isPayment(), 404);

        $subscriber->loadMissing(['profile', 'branch', 'meterBox']);
        $transaction->loadMissing(['recordedBy', 'cancelledBy']);

        return Inertia::render('Subscribers/PaymentReceipt', [
            'subscriber' => [
                'id' => $subscriber->id,
                'fullName' => $subscriber->displayName(),
                'accountNumber' => $subscriber->account_number,
                'subscriberNumber' => $subscriber->profile?->subscriber_number,
                'phone' => $subscriber->contactPhone(),
                'branchName' => $subscriber->branch->name,
                'meterBoxNumber' => $subscriber->meterBox?->box_number,
            ],
            'receipt' => [
                'id' => $transaction->id,
                'voucherNumber' => $transaction->displayVoucherNumber(),
                'systemVoucherNumber' => $transaction->printedVoucherNumber(),
                'manualVoucherNumber' => $transaction->manual_voucher_number,
                'date' => DailySeries::localDate($transaction->created_at),
                'time' => DailySeries::localTime($transaction->created_at),
                'amount' => SubscriberTransaction::formatAmount($transaction->currency_amount ?? ltrim($transaction->amount, '-')),
                'currencyLabel' => __($transaction->currency->label()),
                'isShekel' => $transaction->currency === Currency::Shekel,
                'inShekels' => SubscriberTransaction::formatAmount(ltrim($transaction->amount, '-')),
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

    /** @return array{id: int, voucherNumber: ?string, subscriberName: string, url: string} */
    private function referenceTransactionData(SubscriberTransaction $transaction): array
    {
        $transaction->loadMissing('subscriber');

        return [
            'id' => $transaction->id,
            'voucherNumber' => $transaction->displayVoucherNumber(),
            'subscriberName' => $transaction->subscriber->displayName(),
            'url' => route('subscribers.statement', $transaction->subscriber).'#statement-line-'.$transaction->id,
        ];
    }
}
