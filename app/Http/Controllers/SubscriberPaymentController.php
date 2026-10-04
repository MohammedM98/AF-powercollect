<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreSubscriberPaymentRequest;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Notifications\ActionCompleted;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;

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
        ]);

        return back()->with('status', 'payment-recorded');
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
