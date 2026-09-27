<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreSubscriberPaymentRequest;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Notifications\ActionCompleted;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;

class SubscriberPaymentController extends Controller
{
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
            sprintf('%s — %s شيكل', $subscriber->full_name, SubscriberTransaction::formatAmount(ltrim($payment->amount, '-'))),
        ));

        Inertia::flash('recordedPayment', [
            'voucherNumber' => $payment->printedVoucherNumber(),
            'balance' => number_format($subscriber->balance(), 2, '.', ''),
        ]);

        return back()->with('status', 'payment-recorded');
    }
}
