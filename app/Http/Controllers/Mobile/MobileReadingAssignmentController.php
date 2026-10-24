<?php

namespace App\Http\Controllers\Mobile;

use App\Enums\PermissionKey;
use App\Enums\ReadingSubmissionStatus;
use App\Enums\SubscriptionStatus;
use App\Http\Controllers\Controller;
use App\Models\MeterReading;
use App\Models\ReadingAssignment;
use App\Models\ReadingCycle;
use App\Models\ReadingEntrySetting;
use App\Models\ReadingSubmission;
use App\Models\Subscription;
use App\Support\DailySeries;
use App\Support\FieldReadingAuthorization;
use App\Support\FieldReadingSync;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The field reader's assignments for the app to keep offline, and the
 * readings it uploads for them. Assignments can be downloaded ahead of the
 * reading day and viewed, but readings are entered on the reading day only
 * (`entry_open`); each comes with a signed work authorisation that its
 * readings carry back.
 */
class MobileReadingAssignmentController extends Controller
{
    /** The most readings one upload may carry. */
    public const MAX_READINGS = 200;

    public function __construct(private FieldReadingSync $sync) {}

    /**
     * The reader's approved assignments of open cycles whose readings can
     * still be uploaded, with each box's active subscriptions. Downloading
     * marks each one downloaded at its version.
     */
    public function index(Request $request): JsonResponse
    {
        $reader = $request->user();
        abort_unless($reader->hasPermission(PermissionKey::RecordMeterReadings), 403);

        $today = DailySeries::today();
        $leadDays = ReadingEntrySetting::forBranch($reader->workBranchId())->assignment_lead_days ?? 1;
        $assignments = ReadingAssignment::query()
            ->forMobileReader($reader)
            ->whereHas('cycle', fn (Builder $cycles) => $cycles->whereDate('reading_date', '>=', $today->copy()->subDays(ReadingCycle::SYNC_GRACE_DAYS)->toDateString()))
            ->with(['cycle', 'meterBox.subArea'])
            ->orderBy('reading_cycle_id')
            ->get()
            ->filter(fn (ReadingAssignment $assignment): bool => $today->toDateString() >= $assignment->cycle->reading_date->copy()
                ->subDays($leadDays)->toDateString())
            ->values();

        DB::transaction(function () use ($assignments, $reader): void {
            foreach ($assignments as $assignment) {
                if (! $assignment->isDownloaded()) {
                    $assignment->update(['downloaded_at' => now(), 'downloaded_version' => $assignment->version]);
                    $assignment->recordEvent('downloaded', $reader, $assignment->channel, $assignment->user_id);
                }
            }
        });

        return response()->json([
            'server_time' => now()->toIso8601String(),
            'business_date' => $today->toDateString(),
            'assignments' => $assignments->map(fn (ReadingAssignment $assignment) => $this->assignmentData($assignment, $today->toDateString()))->values(),
        ]);
    }

    /**
     * Upload readings taken offline. Each is answered on its own — accepted,
     * held for review or refused — and an upload retried with the same
     * operation ids is answered the same way without saving anything twice.
     */
    public function sync(Request $request): JsonResponse
    {
        $reader = $request->user();
        abort_unless($reader->hasPermission(PermissionKey::RecordMeterReadings), 403);

        $validated = $request->validate([
            'readings' => ['required', 'array', 'min:1', 'max:'.self::MAX_READINGS],
            'readings.*.operation_id' => ['required', 'uuid', 'distinct'],
            'readings.*.assignment_id' => ['required', 'integer'],
            'readings.*.authorization' => ['required', 'string', 'max:1000'],
            'readings.*.subscription_id' => ['required', 'integer'],
            'readings.*.current_reading' => ['required', 'numeric', 'decimal:0,2', 'min:0', 'max:9999999999.99'],
            'readings.*.captured_at' => ['required', 'date'],
            'readings.*.device_id' => ['nullable', 'string', 'max:100'],
            'readings.*.notes' => ['nullable', 'string', 'max:1000'],
        ]);

        return response()->json([
            'results' => array_map(fn (array $reading): array => $this->sync->submit($reader, $reading), $validated['readings']),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function assignmentData(ReadingAssignment $assignment, string $today): array
    {
        $cycle = $assignment->cycle;
        $weekStart = $cycle->week_start;
        $subscriptions = Subscription::query()
            ->where('branch_id', $assignment->branch_id)
            ->where('meter_box_id', $assignment->meter_box_id)
            ->where('status', SubscriptionStatus::Active)
            ->whereNull('archived_at')
            ->with(['meterReadings' => fn ($query) => $query->whereDate('week_start', '<=', $weekStart->toDateString())->orderByDesc('week_start')->limit(4)])
            ->orderBy('account_number')
            ->get();
        $held = ReadingSubmission::query()->where('reading_assignment_id', $assignment->id)->where('user_id', $assignment->user_id)
            ->where('status', ReadingSubmissionStatus::NeedsReview)->latest('id')->get()->unique('subscription_id')->keyBy('subscription_id');

        return [
            'id' => $assignment->id,
            'version' => $assignment->version,
            'authorization' => FieldReadingAuthorization::issue($assignment),
            'cycle' => [
                'id' => $cycle->id,
                'week_start' => $weekStart->toDateString(),
                'week_end' => $cycle->week_end->toDateString(),
                'reading_date' => $cycle->reading_date->toDateString(),
                'entry_open' => $cycle->reading_date->toDateString() === $today,
                'entry_starts_at' => $cycle->reading_date->copy()->shiftTimezone(config('app.business_timezone'))->startOfDay()->toIso8601String(),
                'entry_ends_at' => $cycle->reading_date->copy()->shiftTimezone(config('app.business_timezone'))->endOfDay()->toIso8601String(),
                'sync_deadline' => $cycle->syncDeadline()->toIso8601String(),
            ],
            'meter_box' => [
                'id' => $assignment->meterBox->id,
                'number' => $assignment->meterBox->box_number,
                'name' => $assignment->meterBox->displayName(),
                'location' => $assignment->meterBox->location,
                'sub_area_id' => $assignment->meterBox->sub_area_id,
                'sub_area_name' => $assignment->meterBox->subArea?->name,
            ],
            'subscriptions' => $subscriptions->map(function (Subscription $subscription) use ($weekStart, $held): array {
                $current = $subscription->meterReadings->first(fn (MeterReading $reading): bool => $reading->week_start->equalTo($weekStart));
                $previous = $subscription->meterReadings->first(fn (MeterReading $reading): bool => $reading->week_start->lt($weekStart));
                $heldReading = $held->get($subscription->id);

                return [
                    'id' => $subscription->id,
                    'name' => $subscription->displayName(),
                    'account_number' => $subscription->account_number,
                    'previous_reading' => $current?->previous_reading ?? $previous?->nextPreviousReading() ?? $subscription->initial_reading,
                    'already_read' => $current !== null || $heldReading !== null,
                    'current_reading' => $current?->requires_reentry ? null : ($current?->current_reading ?? $heldReading?->current_reading),
                    'reading_status' => $current?->status?->value ?? ($heldReading === null ? null : ReadingSubmissionStatus::NeedsReview->value),
                    'recent_readings' => $subscription->meterReadings->filter(fn (MeterReading $reading): bool => $reading->week_start->lt($weekStart))->take(3)
                        ->map(fn (MeterReading $reading): array => ['week_start' => $reading->week_start->toDateString(), 'current_reading' => $reading->current_reading, 'consumption' => $reading->consumption])->values(),
                ];
            })->values(),
        ];
    }
}
