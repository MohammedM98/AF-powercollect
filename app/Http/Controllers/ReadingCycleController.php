<?php

namespace App\Http\Controllers;

use App\Enums\ReadingAssignmentChannel;
use App\Enums\ReadingAssignmentStatus;
use App\Enums\ReadingSubmissionStatus;
use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\StoreReadingCycleRequest;
use App\Models\Branch;
use App\Models\MeterBox;
use App\Models\MeterReading;
use App\Models\PaperSheet;
use App\Models\ReadingCycle;
use App\Models\SubArea;
use App\Models\User;
use App\Notifications\ActionCompleted;
use App\Support\DailySeries;
use App\Support\ReadingAllocation;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

/**
 * Reading cycles: each branch's reading weeks prepared ahead, and the board
 * where a cycle's meter boxes are allocated to field readers or to paper
 * sheets and approved.
 */
class ReadingCycleController extends Controller
{
    use FiltersDataTable;

    /** How many weeks ahead a cycle can be prepared. */
    private const WEEKS_AHEAD = 3;

    public function __construct(private ReadingAllocation $allocation) {}

    /**
     * The cycles the user may see, newest week first, with how far each one's
     * allocation and readings have come.
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', ReadingCycle::class);

        $actor = $request->user();
        $query = ReadingCycle::query()
            ->visibleTo($actor)
            ->with(['branch', 'createdBy'])
            ->withCount([
                'assignments as mobile_count' => fn (Builder $assignments) => $assignments->where('channel', ReadingAssignmentChannel::Mobile)->where('status', '!=', ReadingAssignmentStatus::Unassigned),
                'assignments as paper_count' => fn (Builder $assignments) => $assignments->where('channel', ReadingAssignmentChannel::Paper)->where('status', '!=', ReadingAssignmentStatus::Unassigned),
                'assignments as approved_count' => fn (Builder $assignments) => $assignments->where('status', ReadingAssignmentStatus::Approved),
                'submissions as review_count' => fn (Builder $submissions) => $submissions->where('status', ReadingSubmissionStatus::NeedsReview),
            ]);
        $this->applyDataTableFilters($query, $request, ['notes'], ['week_start', 'reading_date'], 'week_start', 'desc');
        $this->applyDataTableFilterSelects($query, $request, ['branch_id']);

        $cycles = $query->paginate($this->dataTablePerPage($request))
            ->withQueryString()
            ->through(fn (ReadingCycle $cycle) => [
                'id' => $cycle->id,
                'branchName' => $cycle->branch->name,
                'weekStart' => $cycle->week_start->toDateString(),
                'weekEnd' => $cycle->week_end->toDateString(),
                'readingDate' => $cycle->reading_date->toDateString(),
                'readingDayName' => $cycle->reading_date->locale('ar')->dayName,
                'movedReadingDay' => ! $cycle->reading_date->isSameDay($cycle->week_end),
                'stage' => $cycle->stage(),
                'notes' => $cycle->notes,
                'mobileCount' => (int) $cycle->mobile_count,
                'paperCount' => (int) $cycle->paper_count,
                'approvedCount' => (int) $cycle->approved_count,
                'reviewCount' => (int) $cycle->review_count,
                'createdBy' => $cycle->createdBy?->name,
            ]);

        $branches = $actor->isSuperAdmin() ? Branch::query()->orderBy('name')->get() : Branch::query()->whereKey($actor->workBranchId())->get();

        return Inertia::render('ReadingCycles/Index', [
            'cycles' => $cycles,
            'canCreate' => $actor->can('create', ReadingCycle::class),
            'branchOptions' => $actor->isSuperAdmin() ? $this->modelOptions($branches) : [],
            'weekOptions' => $branches->mapWithKeys(fn (Branch $branch) => [$branch->id => $this->weekOptions($branch)]),
            'defaultBranchId' => $actor->workBranchId(),
            'filters' => $this->dataTableState($request, 'week_start', 'desc'),
            'filterOptions' => $actor->isSuperAdmin() ? [$this->branchFilterGroup()] : [],
        ]);
    }

    /**
     * Prepare a reading cycle for one of the branch's weeks.
     */
    public function store(StoreReadingCycleRequest $request): RedirectResponse
    {
        $branch = $request->branch();
        $weekStart = Carbon::parse($request->validated('week_start'));

        $cycle = ReadingCycle::create([
            'branch_id' => $branch->id,
            'week_start' => $weekStart->toDateString(),
            'week_end' => MeterReading::weekEndFor($weekStart, $branch)->toDateString(),
            'reading_date' => $request->validated('reading_date'),
            'notes' => $request->validated('notes'),
            'created_by' => $request->user()->id,
        ]);

        $request->user()->notify(new ActionCompleted('reading-cycle-created', $branch->name.' — '.$cycle->reading_date->toDateString()));

        return redirect()->route('reading-cycles.show', $cycle)->with('status', 'reading-cycle-created');
    }

    /**
     * The cycle's allocation board: the boxes still available, each reader's
     * boxes, the paper boxes, the paper sheets printed, and how far the
     * readings have come.
     */
    public function show(Request $request, ReadingCycle $readingCycle): InertiaResponse
    {
        $this->authorize('view', $readingCycle);

        $actor = $request->user();
        $cycle = $readingCycle->load('branch');
        $boxes = $cycle->eligibleMeterBoxes();
        $assignments = $cycle->assignments()->with(['user', 'approvedBy:id,name'])->get()->keyBy('meter_box_id');
        $readCounts = $this->readCounts($cycle, $boxes->pluck('id'));
        $readers = $cycle->eligibleReaders();
        $previous = $cycle->previous();

        $boards = $boxes->map(function (MeterBox $box) use ($assignments, $readCounts): array {
            $assignment = $assignments->get($box->id);
            $allocated = $assignment !== null && $assignment->status !== ReadingAssignmentStatus::Unassigned;

            return [
                'id' => $box->id,
                'number' => $box->box_number,
                'name' => $box->displayName(),
                'subAreaId' => $box->sub_area_id,
                'subAreaName' => $box->subArea?->name,
                'subscribers' => (int) $box->active_subscriptions_count,
                'read' => (int) ($readCounts[$box->id] ?? 0),
                'version' => $assignment?->version ?? 0,
                'column' => match (true) {
                    ! $allocated => 'available',
                    $assignment->channel === ReadingAssignmentChannel::Paper => 'paper',
                    default => 'reader:'.$assignment->user_id,
                },
                'assignmentId' => $allocated ? $assignment->id : null,
                'status' => $allocated ? $assignment->status->value : null,
                'approvedBy' => $allocated ? $assignment->approvedBy?->name : null,
                'downloaded' => $allocated && $assignment->wasDownloaded(),
                'downloadedCurrent' => $allocated && $assignment->isDownloaded(),
            ];
        })->values();

        $abilities = [
            'manage' => $actor->can('manage', $cycle) && ! $cycle->isClosed(),
            'manageCycle' => $actor->can('manage', $cycle),
            'approve' => $actor->can('approve', $cycle) && ! $cycle->isClosed(),
            'printSheets' => $actor->can('printSheets', $cycle),
            'review' => $actor->can('review', $cycle),
        ];

        return Inertia::render('ReadingCycles/Show', [
            'cycle' => [
                'id' => $cycle->id,
                'branchName' => $cycle->branch->name,
                'weekStart' => $cycle->week_start->toDateString(),
                'weekEnd' => $cycle->week_end->toDateString(),
                'readingDate' => $cycle->reading_date->toDateString(),
                'readingDayName' => $cycle->reading_date->locale('ar')->dayName,
                'maxReadingDate' => $cycle->week_end->copy()->addDays(6)->toDateString(),
                'stage' => $cycle->stage(),
                'notes' => $cycle->notes,
                'isClosed' => $cycle->isClosed(),
                'hasPrevious' => $previous !== null,
                'previousLabel' => $previous ? 'الأسبوع المنتهي '.$previous->week_end->toDateString() : null,
            ],
            'boards' => $boards,
            'readers' => $readers->map(fn (User $reader) => ['id' => $reader->id, 'name' => $reader->name])->values(),
            'subAreaOptions' => SubArea::query()->whereIn('id', $boxes->pluck('sub_area_id')->filter()->unique())->orderBy('name')->get()->map(fn (SubArea $subArea) => ['value' => (string) $subArea->id, 'label' => $subArea->name])->values(),
            'paperSheets' => $abilities['printSheets'] || $abilities['manage'] ? $cycle->paperSheets()->withCount('assignments')->with('lastPrintedBy:id,name')->latest('id')->get()->map(fn (PaperSheet $sheet) => [
                'id' => $sheet->id,
                'number' => $sheet->sheet_number,
                'boxes' => (int) $sheet->assignments_count,
                'printCount' => $sheet->print_count,
                'lastPrintedAt' => $sheet->last_printed_at?->timezone(config('app.business_timezone'))->format('Y-m-d H:i'),
                'lastPrintedBy' => $sheet->lastPrintedBy?->name,
            ])->values() : [],
            'reviewCount' => $cycle->submissions()->where('status', ReadingSubmissionStatus::NeedsReview)->count(),
            'abilities' => $abilities,
            'today' => DailySeries::today()->toDateString(),
        ]);
    }

    /**
     * Move the cycle's reading day (within the days its week allows), change
     * its notes, or close or reopen it.
     */
    public function update(Request $request, ReadingCycle $readingCycle): RedirectResponse
    {
        $this->authorize('manage', $readingCycle);

        $validated = $request->validate([
            'reading_date' => ['sometimes', 'date_format:Y-m-d', 'after_or_equal:'.$readingCycle->week_end->toDateString(), 'before_or_equal:'.$readingCycle->week_end->copy()->addDays(6)->toDateString()],
            'notes' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'closed' => ['sometimes', 'boolean'],
        ], [
            'reading_date.after_or_equal' => 'يوم القراءة لا يكون قبل نهاية الأسبوع.',
            'reading_date.before_or_equal' => 'يوم القراءة لا يتجاوز ستة أيام بعد نهاية الأسبوع.',
        ]);

        $data = collect($validated)->only(['reading_date', 'notes'])->all();

        if (array_key_exists('closed', $validated)) {
            $data += $validated['closed']
                ? ($readingCycle->isClosed() ? [] : ['closed_at' => now(), 'closed_by' => $request->user()->id])
                : ['closed_at' => null, 'closed_by' => null];
        }

        $readingCycle->update($data);
        $request->user()->notify(new ActionCompleted('reading-cycle-updated', $readingCycle->reading_date->toDateString()));

        return back()->with('status', 'reading-cycle-updated');
    }

    /**
     * Start the allocation from the branch's previous cycle, as drafts.
     */
    public function copyPrevious(Request $request, ReadingCycle $readingCycle): RedirectResponse
    {
        $this->authorize('manage', $readingCycle);

        if ($readingCycle->isClosed()) {
            return back()->withErrors(['copy' => 'دورة القراءة مغلقة.']);
        }

        $result = $this->allocation->copyPrevious($readingCycle, $request->user());
        Inertia::flash('allocationResult', ['action' => 'copy', 'moved' => $result['copied'], 'conflicts' => $result['skipped']]);

        return back()->with('status', 'reading-cycle-copied');
    }

    /**
     * The weeks a cycle can be prepared for: the latest week that has ended
     * while its reading can still be moved to today or later, and the next
     * few. Each says the reading day it defaults to and the latest one
     * allowed, and whether the branch already has a cycle for it.
     *
     * @return array<int, array{value: string, end: string, label: string, defaultReadingDate: string, maxReadingDate: string, taken: bool}>
     */
    private function weekOptions(Branch $branch): array
    {
        $today = Carbon::parse(DailySeries::today()->toDateString());
        $taken = ReadingCycle::query()->where('branch_id', $branch->id)->pluck('week_start')->map(fn ($date) => Carbon::parse($date)->toDateString())->flip();
        $weekStart = MeterReading::latestEndedWeekStart($branch);
        $options = [];

        for ($index = 0; $index <= self::WEEKS_AHEAD; $index++) {
            $weekEnd = MeterReading::weekEndFor($weekStart, $branch);
            $maxReadingDate = $weekEnd->copy()->addDays(6);

            if ($maxReadingDate->gte($today)) {
                $options[] = [
                    'value' => $weekStart->toDateString(),
                    'end' => $weekEnd->toDateString(),
                    'label' => 'الأسبوع المنتهي '.$weekEnd->locale('ar')->dayName.' '.$weekEnd->format('d-m-Y'),
                    'defaultReadingDate' => $weekEnd->max($today)->toDateString(),
                    'maxReadingDate' => $maxReadingDate->toDateString(),
                    'taken' => $taken->has($weekStart->toDateString()),
                ];
            }

            $weekStart = MeterReading::weekStartFor($weekEnd->copy()->addDay(), $branch);
        }

        return $options;
    }

    /**
     * How many of each box's subscriptions have the cycle week's reading.
     *
     * @param  Collection<int, int>  $boxIds
     * @return array<int, int>
     */
    private function readCounts(ReadingCycle $cycle, Collection $boxIds): array
    {
        return DB::table('meter_readings')
            ->join('subscriptions', 'subscriptions.id', '=', 'meter_readings.subscription_id')
            ->whereIn('subscriptions.meter_box_id', $boxIds)
            ->whereDate('meter_readings.week_start', $cycle->week_start->toDateString())
            ->groupBy('subscriptions.meter_box_id')
            ->pluck(DB::raw('count(*)'), 'subscriptions.meter_box_id')
            ->map(fn ($count) => (int) $count)
            ->all();
    }
}
