<?php

namespace App\Http\Controllers;

use App\Models\MeterBox;
use App\Models\Subscriber;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MeterBoxSubscriberController extends Controller
{
    public function index(Request $request, MeterBox $meterBox): JsonResponse
    {
        $this->authorize('viewAny', MeterBox::class);
        $this->authorize('viewAny', Subscriber::class);
        $actor = $request->user();
        abort_unless($actor->isSuperAdmin() || $meterBox->branch_id === $actor->branch_id, 404);

        $subscribers = $meterBox->subscribers()->visibleTo($actor)
            ->with('circuitBreaker:id,ampere', 'latestMeterReading')
            ->withSum('transactions as outstanding_balance', 'amount')
            ->orderBy('account_number')->orderBy('subscribers.id')
            ->paginate(15)
            ->through(fn (Subscriber $subscriber): array => [
                'id' => $subscriber->id,
                'display_name' => $subscriber->displayName(),
                'account_number' => $subscriber->account_number,
                'phone' => $subscriber->contactPhone(),
                'status' => $subscriber->status->value,
                'statusLabel' => __($subscriber->status->label()),
                'circuitBreakerAmpere' => $subscriber->circuitBreaker?->ampere,
                'outstandingBalance' => number_format((float) ($subscriber->outstanding_balance ?? 0), 2, '.', ''),
                'lastReading' => $subscriber->latestMeterReading?->current_reading ?? $subscriber->initial_reading,
                'statementUrl' => route('subscribers.statement', $subscriber, absolute: false),
            ]);

        return response()->json($subscribers);
    }
}
