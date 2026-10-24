<?php

namespace App\Http\Controllers;

use App\Enums\ReadingAssignmentChannel;
use App\Enums\ReadingAssignmentStatus;
use App\Enums\SubscriptionStatus;
use App\Models\PaperSheet;
use App\Models\ReadingAssignment;
use App\Models\ReadingCycle;
use App\Models\Subscription;
use App\Notifications\ActionCompleted;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

/**
 * The paper reading sheets of a cycle: a numbered sheet for approved paper
 * boxes, printed and reprinted from its own page. Printing is counted, and
 * never allocates a box again. The readings written on it are entered later
 * from the reading sheet.
 */
class PaperSheetController extends Controller
{
    /**
     * Put the chosen approved paper boxes on a new numbered sheet.
     */
    public function store(Request $request, ReadingCycle $readingCycle): RedirectResponse
    {
        $this->authorize('printSheets', $readingCycle);

        $validated = $request->validate([
            'box_ids' => ['required', 'array', 'min:1', 'max:200'],
            'box_ids.*' => ['integer', 'distinct'],
        ], ['box_ids.required' => 'اختر طبلونًا ورقيًا واحدًا على الأقل.']);

        $assignments = $readingCycle->assignments()
            ->whereIn('meter_box_id', $validated['box_ids'])
            ->where('channel', ReadingAssignmentChannel::Paper)
            ->where('status', ReadingAssignmentStatus::Approved)
            ->pluck('id');

        if ($assignments->isEmpty()) {
            return back()->withErrors(['box_ids' => 'اختر طبلونات ورقية معتمدة؛ يُطبع الكشف بعد اعتماد التوزيع.']);
        }

        $sheet = DB::transaction(function () use ($readingCycle, $assignments, $request): PaperSheet {
            $sequence = $readingCycle->paperSheets()->lockForUpdate()->count() + 1;
            $sheet = $readingCycle->paperSheets()->create([
                'sheet_number' => sprintf('%d-%s-%02d', $readingCycle->branch_id, $readingCycle->week_end->format('Ymd'), $sequence),
                'created_by' => $request->user()->id,
            ]);
            $sheet->assignments()->attach($assignments);

            return $sheet;
        });

        $request->user()->notify(new ActionCompleted('paper-sheet-created', $sheet->sheet_number));

        return redirect()->route('paper-sheets.show', $sheet)->with('status', 'paper-sheet-created');
    }

    /**
     * The sheet as printed: each box with its active subscriptions and the
     * reading the week starts from, with an empty column for the new one.
     */
    public function show(Request $request, PaperSheet $paperSheet): InertiaResponse
    {
        $cycle = $paperSheet->cycle()->with('branch')->firstOrFail();
        $this->authorize('printSheets', $cycle);

        $assignments = $paperSheet->assignments()->with('meterBox.subArea')->get()->sortBy(fn (ReadingAssignment $assignment) => $assignment->meterBox->label())->values();
        $subscriptions = Subscription::query()->whereIn('meter_box_id', $assignments->pluck('meter_box_id'))
            ->where('branch_id', $cycle->branch_id)->where('status', SubscriptionStatus::Active)->whereNull('archived_at')
            ->with(['meterReadings' => fn (HasMany $readings): HasMany => $readings->where('week_start', '<', $cycle->week_start->toDateString())->orderByDesc('week_start')->limit(1)])
            ->orderBy('account_number')->get()->groupBy('meter_box_id');

        return Inertia::render('ReadingCycles/PaperSheet', [
            'sheet' => [
                'id' => $paperSheet->id,
                'number' => $paperSheet->sheet_number,
                'printCount' => $paperSheet->print_count,
                'lastPrintedAt' => $paperSheet->last_printed_at?->timezone(config('app.business_timezone'))->format('Y-m-d H:i'),
            ],
            'cycle' => [
                'id' => $cycle->id,
                'branchName' => $cycle->branch->name,
                'weekStart' => $cycle->week_start->toDateString(),
                'weekEnd' => $cycle->week_end->toDateString(),
                'readingDate' => $cycle->reading_date->toDateString(),
            ],
            'boxes' => $assignments->map(fn (ReadingAssignment $assignment) => [
                'id' => $assignment->meter_box_id,
                'label' => $assignment->meterBox->label(),
                'name' => $assignment->meterBox->displayName(),
                'number' => $assignment->meterBox->box_number,
                'subAreaName' => $assignment->meterBox->subArea?->name,
                'movedOffPaper' => $assignment->channel !== ReadingAssignmentChannel::Paper || $assignment->status !== ReadingAssignmentStatus::Approved,
                'subscriptions' => $subscriptions->get($assignment->meter_box_id, collect())
                    ->map(fn (Subscription $subscription) => [
                        'id' => $subscription->id,
                        'name' => $subscription->displayName(),
                        'accountNumber' => $subscription->account_number,
                        'phone' => $subscription->contactPhone(),
                        'previousReading' => $subscription->meterReadings->first()?->nextPreviousReading() ?? (float) ($subscription->initial_reading ?? 0),
                    ])->values(),
            ])->values(),
        ]);
    }

    /**
     * Count one printing of the sheet.
     */
    public function printed(Request $request, PaperSheet $paperSheet): RedirectResponse|JsonResponse
    {
        $this->authorize('printSheets', $paperSheet->cycle);

        PaperSheet::query()->whereKey($paperSheet->id)->update([
            'print_count' => DB::raw('print_count + 1'),
            'last_printed_at' => now(),
            'last_printed_by' => $request->user()->id,
        ]);

        return $request->expectsJson() ? response()->json(['printed' => true]) : back();
    }
}
