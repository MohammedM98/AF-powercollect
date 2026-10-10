<?php

namespace App\Http\Controllers\Mobile;

use App\Enums\PermissionKey;
use App\Enums\SubscriptionStatus;
use App\Http\Controllers\Controller;
use App\Models\MeterReading;
use App\Models\Subscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MobileSubscriptionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $actor = $request->user();

        abort_unless($actor->hasPermission(PermissionKey::RecordMeterReadings), 403);

        $weekStart = MeterReading::latestEndedWeekStart($actor->branch_id);
        $week = $weekStart->toDateString();
        $subscriptions = Subscription::query()
            ->visibleTo($actor)
            ->where('status', SubscriptionStatus::Active)
            ->with([
                'meterBox:id,box_number,name,name_suffix,location',
                'latestMeterReading',
                'meterReadings' => fn ($query) => $query->whereDate('week_start', '<=', $week)->orderByDesc('week_start')->limit(4),
            ])
            ->orderBy('id')
            ->paginate(500);

        return response()->json([
            'week_start' => $week,
            'week_end' => MeterReading::weekEndFor($weekStart, $actor->branch_id)->toDateString(),
            'can_record_readings_now' => $actor->can('create', [MeterReading::class, $weekStart]),
            'data' => $subscriptions->getCollection()->map(function (Subscription $subscription) use ($week): array {
                $currentWeekReading = $subscription->meterReadings->first(fn (MeterReading $reading): bool => $reading->week_start->toDateString() === $week);

                return [
                    'id' => $subscription->id,
                    'account_number' => $subscription->account_number,
                    'full_name' => $subscription->displayName(),
                    'meter_box_id' => $subscription->meter_box_id,
                    'meter_box_number' => $subscription->meterBox?->box_number,
                    'meter_box_name' => $subscription->meterBox?->displayName(),
                    'meter_box_location' => $subscription->meterBox?->location,
                    'previous_reading' => $currentWeekReading?->previous_reading
                        ?? $subscription->latestMeterReading?->current_reading
                        ?? $subscription->initial_reading,
                    'current_reading' => $currentWeekReading?->current_reading,
                    'reading_status' => $currentWeekReading?->status?->value,
                    'recent_readings' => $subscription->meterReadings
                        ->reject(fn (MeterReading $reading): bool => $reading->week_start->toDateString() === $week)
                        ->take(3)
                        ->map(fn (MeterReading $reading): array => [
                            'week_start' => $reading->week_start->toDateString(),
                            'current_reading' => $reading->current_reading,
                            'consumption' => $reading->consumption,
                        ])
                        ->values()
                        ->all(),
                ];
            })->all(),
            'current_page' => $subscriptions->currentPage(),
            'last_page' => $subscriptions->lastPage(),
            'total' => $subscriptions->total(),
        ]);
    }
}
