<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreSubscriberPaymentRequest;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Notifications\ActionCompleted;
use Illuminate\Http\RedirectResponse;

class SubscriberPaymentController extends Controller
{
    /**
     * Record a payment on the subscriber's account; it lowers the balance
     * straight away.
     */
    public function store(StoreSubscriberPaymentRequest $request, Subscriber $subscriber): RedirectResponse
    {
        $payment = SubscriberTransaction::recordPayment($subscriber, $request->user(), $request->validated());

        $request->user()->notify(new ActionCompleted(
            'payment-recorded',
            sprintf('%s — %s شيكل', $subscriber->full_name, ltrim($payment->amount, '-')),
        ));

        return back()->with('status', 'payment-recorded');
    }
}
