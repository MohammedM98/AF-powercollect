<?php

namespace App\Http\Controllers\Mobile;

use App\Enums\MeterReadingStatus;
use App\Enums\SubscriptionStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMobileMeterReadingRequest;
use App\Models\MeterReading;
use App\Models\Subscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class MobileReadingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', MeterReading::class);

        $validated = $request->validate([
            'week' => ['nullable', 'date_format:Y-m-d'],
            'search' => ['nullable', 'string', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);
        $weekStart = isset($validated['week'])
            ? MeterReading::weekStartFor(Carbon::parse($validated['week']))
            : MeterReading::latestEndedWeekStart();
        $week = $weekStart->toDateString();
        $search = trim($validated['search'] ?? '');
        $subscriptions = Subscription::query()
            ->visibleTo($request->user())
            ->where('status', SubscriptionStatus::Active)
            ->with([
                'meterBox:id,box_number',
                'meterReadings' => fn ($query) => $query->visibleTo($request->user())
                    ->whereDate('week_start', '<=', $week)->orderByDesc('week_start')->limit(1),
            ])
            ->matchingSearch($search)
            ->orderBy('full_name')->orderBy('id')->paginate(25);

        return response()->json([
            'week_start' => $week,
            'week_end' => MeterReading::weekEndFor($weekStart)->toDateString(),
            'week_options' => MeterReading::recentWeekOptions(),
            'data' => $subscriptions->getCollection()->map(function (Subscription $subscription) use ($week): array {
                $latest = $subscription->meterReadings->first();
                $reading = $latest?->week_start->toDateString() === $week ? $latest : null;

                return [
                    'id' => $subscription->id,
                    'full_name' => $subscription->displayName(),
                    'account_number' => $subscription->account_number,
                    'meter_box_number' => $subscription->meterBox?->box_number,
                    'previous_reading' => $reading?->previous_reading ?? $latest?->current_reading ?? $subscription->initial_reading,
                    'current_reading' => $reading?->current_reading,
                    'consumption' => $reading?->consumption,
                    'amount_due' => $reading?->amount_due,
                    'status' => $reading?->status->value,
                ];
            })->all(),
            'current_page' => $subscriptions->currentPage(),
            'last_page' => $subscriptions->lastPage(),
            'total' => $subscriptions->total(),
        ]);
    }

    public function store(StoreMobileMeterReadingRequest $request): JsonResponse
    {
        if ($existingReading = $request->existingReading()) {
            return $this->responseFor($existingReading);
        }

        $subscription = Subscription::with(['tariff', 'circuitBreaker', 'standingDiscount'])
            ->findOrFail($request->integer('subscription_id'));
        $weekStart = $request->weekStart();
        $previousReading = $subscription->previousReadingBefore($weekStart);
        $currentReading = $request->float('current_reading');
        $consumption = MeterReading::consumptionBetween($previousReading, $currentReading);
        $discount = $subscription->standingDiscount;
        $unitPrice = (string) $subscription->tariff->rate;

        $reading = MeterReading::create([
            'subscription_id' => $subscription->id,
            'branch_id' => $subscription->branch_id,
            'week_start' => $weekStart,
            'week_end' => MeterReading::weekEndFor($weekStart),
            'previous_reading' => $previousReading,
            'current_reading' => $currentReading,
            'consumption' => $consumption,
            'usual_consumption' => MeterReading::usualConsumptionIfUnusual($subscription, $consumption, $weekStart),
            'unit_price' => $unitPrice,
            'minimum_payment' => $subscription->weeklyMinimumPayment(),
            'discount_method' => $discount?->method,
            'discount_value' => $discount?->value,
            'discount_segment' => $discount?->segment,
            ...MeterReading::chargesFor($consumption, $unitPrice, $subscription->weeklyMinimumPayment(), $discount?->method, $discount?->value),
            'status' => MeterReadingStatus::Pending,
            'recorded_by' => $request->user()->id,
            'notes' => $request->input('notes'),
            'mobile_operation_id' => $request->validated('mobile_operation_id'),
        ]);

        return $this->responseFor($reading);
    }

    private function responseFor(MeterReading $reading): JsonResponse
    {
        return response()->json([
            'id' => $reading->id,
            'mobile_operation_id' => $reading->mobile_operation_id,
            'status' => $reading->status->value,
            'current_reading' => $reading->current_reading,
            // Far above what the subscription usually uses: it waits for a reviewer to confirm it.
            'unusual_consumption' => $reading->isUnusual(),
        ], 201);
    }
}
