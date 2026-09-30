<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreSubscriberClearingRequest;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Notifications\ActionCompleted;
use Illuminate\Http\RedirectResponse;

class SubscriberClearingController extends Controller
{
    /**
     * Record a clearing (مقاصة): the subscriber gave the company a service,
     * and its value comes off what they owe straight away.
     */
    public function store(StoreSubscriberClearingRequest $request, Subscriber $subscriber): RedirectResponse
    {
        $clearing = SubscriberTransaction::recordClearing($subscriber, $request->user(), $request->validated('amount'), $request->validated('notes'));

        $request->user()->notify(new ActionCompleted(
            'clearing-recorded',
            sprintf('%s — مقاصة %s شيكل', $subscriber->displayName(), SubscriberTransaction::formatAmount(ltrim($clearing->amount, '-'))),
        ));

        return back()->with('status', 'clearing-recorded');
    }
}
