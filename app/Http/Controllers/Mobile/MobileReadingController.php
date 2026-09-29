<?php

namespace App\Http\Controllers\Mobile;

use App\Enums\MeterReadingStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMobileMeterReadingRequest;
use App\Models\MeterReading;
use App\Models\Subscriber;
use Illuminate\Http\JsonResponse;

class MobileReadingController extends Controller
{
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
