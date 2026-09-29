<?php

namespace App\Http\Controllers;

use App\Enums\ChargeType;
use App\Http\Requests\StoreSubscriberChargeRequest;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Notifications\ActionCompleted;
use Illuminate\Http\RedirectResponse;

class SubscriberChargeController extends Controller
{
    /**
     * Charge the subscriber a penalty or disconnection fee by hand; it
     * raises the balance straight away.
     */
    public function store(StoreSubscriberChargeRequest $request, Subscriber $subscriber): RedirectResponse
    {
        $type = ChargeType::from($request->validated('type'));
        $charge = SubscriberTransaction::recordCharge($subscriber, $request->user(), $type, $request->validated('amount'), $request->validated('notes'));

        $request->user()->notify(new ActionCompleted(
            'charge-recorded',
            sprintf('%s — %s %s شيكل', $subscriber->full_name, __($type->label()), SubscriberTransaction::formatAmount($charge->amount)),
        ));

        return back()->with('status', 'charge-recorded');
    }
}
