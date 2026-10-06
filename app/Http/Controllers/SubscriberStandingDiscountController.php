<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateSubscriberStandingDiscountRequest;
use App\Models\Subscriber;
use App\Notifications\ActionCompleted;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class SubscriberStandingDiscountController extends Controller
{
    /**
     * Give the subscriber a standing discount, or change theirs: it is
     * taken off every weekly reading recorded after it, by percentage, free
     * kilowatts or shekels off the kilo price. Readings already recorded keep
     * the discount they were recorded with.
     */
    public function update(UpdateSubscriberStandingDiscountRequest $request, Subscriber $subscriber): RedirectResponse
    {
        $discount = $subscriber->standingDiscount()->updateOrCreate([], [
            'method' => $request->validated('method'),
            'value' => $request->validated('value'),
            'segment' => $request->validated('segment'),
            'notes' => $request->validated('notes'),
            'granted_by' => $request->user()->id,
        ]);

        $request->user()->notify(new ActionCompleted('standing-discount-saved', $subscriber->displayName().' — '.$discount->summary()));

        return back()->with('status', 'standing-discount-saved');
    }

    /**
     * Stop the subscriber's standing discount for the readings recorded
     * after it. Readings already recorded keep theirs.
     */
    public function destroy(Request $request, Subscriber $subscriber): RedirectResponse
    {
        $this->authorize('adjustBalance', $subscriber);

        if ($subscriber->standingDiscount()->delete()) {
            $request->user()->notify(new ActionCompleted('standing-discount-stopped', $subscriber->displayName()));
        }

        return back()->with('status', 'standing-discount-stopped');
    }
}
