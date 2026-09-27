<?php

namespace App\Http\Controllers;

use App\Http\Concerns\BuildsSubscriberStatement;
use App\Models\Subscriber;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class SubscriberStatementController extends Controller
{
    use BuildsSubscriberStatement;

    /**
     * The subscriber's account statement: every charge, payment and
     * discount, oldest first, each with the balance it left.
     */
    public function show(Request $request, Subscriber $subscriber): InertiaResponse
    {
        $this->authorize('view', $subscriber);

        return Inertia::render('Subscribers/Statement', $this->subscriberStatement($request->user(), $subscriber));
    }
}
