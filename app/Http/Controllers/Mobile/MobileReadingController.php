<?php

namespace App\Http\Controllers\Mobile;

use App\Enums\MeterReadingStatus;
use App\Enums\SubscriberStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMobileMeterReadingRequest;
use App\Models\MeterReading;
use App\Models\Subscriber;
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
        $subscribers = Subscriber::query()
            ->visibleTo($request->user())
            ->where('status', SubscriberStatus::Active)
            ->with([
                'meterBox:id,box_number',
                'meterReadings' => fn ($query) => $query->visibleTo($request->user())
                    ->whereDate('week_start', '<=', $week)->orderByDesc('week_start')->limit(1),
            ])
            ->when($search !== '', fn ($query) => $query->where(fn ($matching) => $matching
                ->where('full_name', 'like', '%'.$search.'%')
                ->orWhere('subscription_name', 'like', '%'.$search.'%')
                ->orWhere('account_number', 'like', '%'.$search.'%')
                ->orWhereHas('meterBox', fn ($box) => $box->where('box_number', 'like', '%'.$search.'%'))))
            ->orderBy('full_name')->orderBy('id')->paginate(25);

        return response()->json([
            'week_start' => $week,
            'week_end' => MeterReading::weekEndFor($weekStart)->toDateString(),
            'week_options' => MeterReading::recentWeekOptions(),
            'data' => $subscribers->getCollection()->map(function (Subscriber $subscriber) use ($week): array {
                $latest = $subscriber->meterReadings->first();
                $reading = $latest?->week_start->toDateString() === $week ? $latest : null;

                return [
                    'id' => $subscriber->id,
                    'full_name' => $subscriber->displayName(),
                    'account_number' => $subscriber->account_number,
                    'meter_box_number' => $subscriber->meterBox?->box_number,
                    'previous_reading' => $reading?->previous_reading ?? $latest?->current_reading ?? $subscriber->initial_reading,
                    'current_reading' => $reading?->current_reading,
                    'consumption' => $reading?->consumption,
                    'amount_due' => $reading?->amount_due,
                    'status' => $reading?->status->value,
                ];
            })->all(),
            'current_page' => $subscribers->currentPage(),
            'last_page' => $subscribers->lastPage(),
            'total' => $subscribers->total(),
        ]);
    }

    public function store(StoreMobileMeterReadingRequest $request): JsonResponse
    {
        if ($existingReading = $request->existingReading()) {
            return $this->responseFor($existingReading);
        }

        $subscriber = Subscriber::with(['tariff', 'circuitBreaker', 'standingDiscount'])
            ->findOrFail($request->integer('subscriber_id'));
        $weekStart = $request->weekStart();
        $previousReading = $subscriber->previousReadingBefore($weekStart);
        $currentReading = $request->float('current_reading');
        $consumption = MeterReading::consumptionBetween($previousReading, $currentReading);
        $discount = $subscriber->standingDiscount;
        $unitPrice = (string) $subscriber->tariff->rate;

        $reading = MeterReading::create([
            'subscriber_id' => $subscriber->id,
            'branch_id' => $subscriber->branch_id,
            'week_start' => $weekStart,
            'week_end' => MeterReading::weekEndFor($weekStart),
            'previous_reading' => $previousReading,
            'current_reading' => $currentReading,
            'consumption' => $consumption,
            'unit_price' => $unitPrice,
            'minimum_payment' => $subscriber->weeklyMinimumPayment(),
            'discount_method' => $discount?->method,
            'discount_value' => $discount?->value,
            'discount_segment' => $discount?->segment,
            ...MeterReading::chargesFor($consumption, $unitPrice, $subscriber->weeklyMinimumPayment(), $discount?->method, $discount?->value),
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
        ], 201);
    }
}
