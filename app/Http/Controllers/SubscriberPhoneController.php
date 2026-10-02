<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateSubscriberPhoneRequest;
use App\Models\Subscriber;
use App\Notifications\ActionCompleted;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\DB;

/**
 * Changing a subscriber's mobile number straight from the subscribers
 * list, without opening their form.
 */
class SubscriberPhoneController extends Controller
{
    /**
     * Change the number the list shows: the subscription's own number when
     * it has one, otherwise the personal number (which every subscription
     * of the same person shares).
     */
    public function update(UpdateSubscriberPhoneRequest $request, Subscriber $subscriber): RedirectResponse
    {
        $field = filled($subscriber->subscription_phone) ? 'subscription_phone' : 'phone';

        DB::transaction(function () use ($subscriber, $field, $request): void {
            $subscriber->profile()->lockForUpdate()->first();
            $subscriber->update([$field => $request->validated('phone')]);
        });

        $request->user()->notify(new ActionCompleted('subscriber-phone-updated', $subscriber->displayName()));

        return back()->with('status', 'subscriber-phone-updated');
    }
}
