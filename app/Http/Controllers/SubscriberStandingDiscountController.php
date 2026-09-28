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
     * taken off every weekly reading recorded from now on, by percentage,
     * free kilowatts or shekels off the kilo price.
     */
    public function update(UpdateSubscriberStandingDiscountRequest $request, Subscriber $subscriber): RedirectResponse
    {
        $discount = $subscriber->standingDiscount()->updateOrCreate([], [
            'method' => $request->validated('method'),
            'value' => $request->validated('value'),
            'notes' => $request->validated('notes'),
            'granted_by' => $request->user()->id,
        ]);

        $request->user()->notify(new ActionCompleted('standing-discount-saved', $subscriber->full_name.' — '.$discount->terms()));

        return back()->with('status', 'standing-discount-saved');
    }

    /**
     * Stop the subscriber's standing discount. Readings already recorded
     * keep theirs.
     */
    public function destroy(Request $request, Subscriber $subscriber): RedirectResponse
    {
        $this->authorize('adjustBalance', $subscriber);

        if ($subscriber->standingDiscount()->delete()) {
            $request->user()->notify(new ActionCompleted('standing-discount-stopped', $subscriber->full_name));
        }

        return back()->with('status', 'standing-discount-stopped');
    }
}
