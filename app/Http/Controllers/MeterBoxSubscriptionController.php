<?php

namespace App\Http\Controllers;

use App\Models\MeterBox;
use App\Models\Subscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class MeterBoxSubscriptionController extends Controller
{
    public function index(Request $request, MeterBox $meterBox): JsonResponse|RedirectResponse
    {
        $this->authorize('viewAny', MeterBox::class);
        $this->authorize('viewAny', Subscription::class);
        $actor = $request->user();
        abort_unless($actor->isSuperAdmin() || $meterBox->branch_id === $actor->branch_id, 404);

        // The page loads these rows itself; opened directly in the browser, the boxes page is the place to see them.
        if (! $request->expectsJson()) {
            return redirect()->route('meter-boxes.index');
        }

        $subscriptions = $meterBox->subscriptions()->visibleTo($actor)
            ->with('circuitBreaker:id,ampere', 'latestMeterReading')
            ->withSum('transactions as outstanding_balance', 'amount')
            ->orderBy('account_number')->orderBy('subscriptions.id')
            ->paginate(15)
            ->through(fn (Subscription $subscription): array => [
                'id' => $subscription->id,
                'display_name' => $subscription->displayName(),
                'account_number' => $subscription->account_number,
                'phone' => $subscription->contactPhone(),
                'status' => $subscription->status->value,
                'statusLabel' => __($subscription->status->label()),
                'circuitBreakerAmpere' => $subscription->circuitBreaker?->ampere,
                'outstandingBalance' => number_format((float) ($subscription->outstanding_balance ?? 0), 2, '.', ''),
                'lastReading' => $subscription->latestMeterReading?->current_reading ?? $subscription->initial_reading,
                'statementUrl' => route('subscriptions.statement', $subscription, absolute: false),
            ]);

        return response()->json($subscriptions);
    }
}
