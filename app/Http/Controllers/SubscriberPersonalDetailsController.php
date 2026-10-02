<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateSubscriberPersonalDetailsRequest;
use App\Models\Subscriber;
use App\Notifications\ActionCompleted;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\DB;

/**
 * Changing a subscriber's personal details — name, identity number,
 * mobile number and address — straight from the subscribers list, without
 * opening their whole form. They belong to the person, so every
 * subscription of theirs changes with them.
 */
class SubscriberPersonalDetailsController extends Controller
{
    public function update(UpdateSubscriberPersonalDetailsRequest $request, Subscriber $subscriber): RedirectResponse
    {
        DB::transaction(function () use ($subscriber, $request): void {
            $subscriber->profile()->lockForUpdate()->first();
            $subscriber->update($request->validated());
        });

        $request->user()->notify(new ActionCompleted('subscriber-personal-details-updated', $subscriber->displayName()));

        return back()->with('status', 'subscriber-personal-details-updated');
    }
}
