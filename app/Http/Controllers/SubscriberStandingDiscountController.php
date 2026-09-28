<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateSubscriberStandingDiscountRequest;
use App\Models\StandingDiscount;
use App\Models\Subscriber;
use App\Notifications\ActionCompleted;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SubscriberStandingDiscountController extends Controller
{
    /**
     * Give the subscriber a standing discount, or change theirs: it is
     * taken off the latest week's reading if it has been entered, and off
     * every weekly reading recorded after it, by percentage, free kilowatts
     * or shekels off the kilo price.
     */
    public function update(UpdateSubscriberStandingDiscountRequest $request, Subscriber $subscriber): RedirectResponse
    {
        $discount = DB::transaction(function () use ($request, $subscriber): StandingDiscount {
            $discount = $subscriber->standingDiscount()->updateOrCreate([], [
                'method' => $request->validated('method'),
                'value' => $request->validated('value'),
                'segment' => $request->validated('segment'),
                'notes' => $request->validated('notes'),
                'granted_by' => $request->user()->id,
            ]);

            $subscriber->latestWeekReading()?->applyStandingDiscount($discount, $request->user());

            return $discount;
        });

        $request->user()->notify(new ActionCompleted('standing-discount-saved', $subscriber->full_name.' — '.$discount->summary()));

        return back()->with('status', 'standing-discount-saved');
    }

    /**
     * Stop the subscriber's standing discount, taking it off the latest
     * week's reading too. Earlier weeks keep theirs.
     */
    public function destroy(Request $request, Subscriber $subscriber): RedirectResponse
    {
        $this->authorize('adjustBalance', $subscriber);

        $stopped = DB::transaction(function () use ($request, $subscriber): bool {
            if (! $subscriber->standingDiscount()->delete()) {
                return false;
            }

            $subscriber->latestWeekReading()?->applyStandingDiscount(null, $request->user());

            return true;
        });

        if ($stopped) {
            $request->user()->notify(new ActionCompleted('standing-discount-stopped', $subscriber->full_name));
        }

        return back()->with('status', 'standing-discount-stopped');
    }
}
