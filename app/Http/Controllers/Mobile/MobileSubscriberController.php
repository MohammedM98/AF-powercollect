<?php

namespace App\Http\Controllers\Mobile;

use App\Enums\PermissionKey;
use App\Enums\SubscriberStatus;
use App\Http\Controllers\Controller;
use App\Models\MeterReading;
use App\Models\Subscriber;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MobileSubscriberController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $actor = $request->user();

        abort_unless($actor->hasPermission(PermissionKey::RecordMeterReadings), 403);

        $weekStart = MeterReading::latestEndedWeekStart();
        $week = $weekStart->toDateString();
        $subscribers = Subscriber::query()
            ->visibleTo($actor)
            ->where('status', SubscriberStatus::Active)
            ->with(['meterBox:id,box_number,name,name_suffix,location', 'latestMeterReading', 'meterReadings' => fn ($query) => $query->whereDate('week_start', $week)])
            ->orderBy('id')
            ->paginate(500);

        return response()->json([
            'week_start' => $week,
            'week_end' => MeterReading::weekEndFor($weekStart)->toDateString(),
            'can_record_readings_now' => $actor->can('create', [MeterReading::class, $weekStart]),
            'data' => $subscribers->getCollection()->map(function (Subscriber $subscriber): array {
                $currentWeekReading = $subscriber->meterReadings->first();

                return [
                    'id' => $subscriber->id,
                    'account_number' => $subscriber->account_number,
                    'full_name' => $subscriber->displayName(),
                    'meter_box_id' => $subscriber->meter_box_id,
                    'meter_box_number' => $subscriber->meterBox?->box_number,
                    'meter_box_name' => $subscriber->meterBox?->displayName(),
                    'meter_box_location' => $subscriber->meterBox?->location,
                    'previous_reading' => $currentWeekReading?->previous_reading
                        ?? $subscriber->latestMeterReading?->current_reading
                        ?? $subscriber->initial_reading,
                    'current_reading' => $currentWeekReading?->current_reading,
                    'reading_status' => $currentWeekReading?->status?->value,
                ];
            })->all(),
            'current_page' => $subscribers->currentPage(),
            'last_page' => $subscribers->lastPage(),
            'total' => $subscribers->total(),
        ]);
    }
}
