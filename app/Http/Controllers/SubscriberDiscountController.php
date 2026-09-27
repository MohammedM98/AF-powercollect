<?php

namespace App\Http\Controllers;

use App\Enums\DiscountMethod;
use App\Http\Requests\StoreSubscriberDiscountRequest;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Notifications\ActionCompleted;
use Illuminate\Http\RedirectResponse;

class SubscriberDiscountController extends Controller
{
    /**
     * Take a discount off what the subscriber owes, by percentage,
     * kilowatts or shekels; it lowers the balance straight away.
     */
    public function store(StoreSubscriberDiscountRequest $request, Subscriber $subscriber): RedirectResponse
    {
        $discount = SubscriberTransaction::recordDiscount(
            $subscriber,
            $request->user(),
            DiscountMethod::from($request->validated('method')),
            $request->validated('value'),
            $request->validated('notes'),
        );

        $request->user()->notify(new ActionCompleted(
            'discount-recorded',
            sprintf('%s — %s شيكل', $subscriber->full_name, SubscriberTransaction::formatAmount(ltrim($discount->amount, '-'))),
        ));

        return back()->with('status', 'discount-recorded');
    }
}
