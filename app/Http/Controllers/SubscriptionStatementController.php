<?php

namespace App\Http\Controllers;

use App\Http\Concerns\BuildsSubscriptionStatement;
use App\Models\Subscription;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class SubscriptionStatementController extends Controller
{
    use BuildsSubscriptionStatement;

    /**
     * The subscription's account statement: every charge, payment and
     * discount, oldest first, each with the balance it left.
     */
    public function show(Request $request, Subscription $subscription): InertiaResponse
    {
        $this->authorize('view', $subscription);

        return Inertia::render('Subscriptions/Statement', $this->subscriptionStatement($request->user(), $subscription));
    }
}
