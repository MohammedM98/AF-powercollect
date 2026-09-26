<?php

namespace App\Http\Controllers;

use App\Enums\MeterReadingStatus;
use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\ApproveMeterReadingsRequest;
use App\Models\MeterReading;
use App\Models\User;
use App\Notifications\ActionCompleted;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

/**
 * The accountant's queue: readings waiting for approval. Approving one
 * locks it and charges its amount to the subscriber's transactions.
 */
class MeterReadingApprovalController extends Controller
{
    use FiltersDataTable;

    private const SORTABLE = ['week_start', 'consumption', 'amount_due'];

    /**
     * The pending readings the actor may approve, with the page's totals.
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('approveAny', MeterReading::class);

        $actor = $request->user();
        $pending = $this->pendingReadings($actor, $request);
        $showBranch = $actor->isSuperAdmin();

        $readings = (clone $pending)
            ->with(['subscriber', 'branch', 'recordedBy'])
            ->tap(fn (Builder $query) => $this->applyDataTableFilters($query, $request, [], self::SORTABLE, 'week_start', 'desc'))
            ->orderBy('id')
            ->paginate($this->dataTablePerPage($request, 25))
            ->withQueryString()
            ->through(fn (MeterReading $reading) => [
                'id' => $reading->id,
                'subscriberName' => $reading->subscriber->full_name,
                'accountNumber' => $reading->subscriber->account_number,
                'branchName' => $showBranch ? $reading->branch->name : null,
                'weekStart' => $reading->week_start->toDateString(),
                'weekEnd' => $reading->week_end->toDateString(),
                'previousReading' => $reading->previous_reading,
                'currentReading' => $reading->current_reading,
                'consumption' => $reading->consumption,
                'amountDue' => $reading->amount_due,
                'recordedByName' => $reading->recordedBy?->name,
                'recordedAt' => $reading->created_at->format('Y-m-d H:i'),
            ]);

        return Inertia::render('MeterReadingApprovals/Index', [
            'readings' => $readings,
            'summary' => [
                'count' => (clone $pending)->count(),
                'amountDue' => number_format((float) (clone $pending)->sum('amount_due'), 2, '.', ''),
            ],
            'showBranch' => $showBranch,
            'filters' => $this->dataTableState($request, 'week_start', 'desc', 25),
            'filterOptions' => $this->filterOptions($actor),
        ]);
    }

    /**
     * Approve the ticked readings, or all pending readings matching the
     * page's search and filters. Readings the actor may not approve, or
     * that are no longer pending, are skipped.
     */
    public function store(ApproveMeterReadingsRequest $request): RedirectResponse
    {
        $actor = $request->user();
        $query = $request->boolean('all')
            ? $this->pendingReadings($actor, $request)
            : $this->pendingReadings($actor)->whereKey($request->validated('reading_ids'));

        $approved = 0;
        $query->with('subscriber')->chunkById(200, function (Collection $readings) use ($actor, &$approved): void {
            foreach ($readings as $reading) {
                $reading->approve($actor);
                $approved++;
            }
        });

        if ($approved === 0) {
            return back()->withErrors(['reading_ids' => 'لا توجد قراءات بانتظار الاعتماد ضمن اختيارك.']);
        }

        $actor->notify(new ActionCompleted('meter-readings-approved', "عدد القراءات: {$approved}"));

        return back()->with('status', 'meter-readings-approved');
    }

    /**
     * Pending readings in the actor's branch (every branch for the Super
     * Admin), narrowed by the page's search and filters when `$request`
     * is given.
     *
     * @return Builder<MeterReading>
     */
    private function pendingReadings(User $actor, ?Request $request = null): Builder
    {
        $query = MeterReading::query()
            ->visibleTo($actor)
            ->where('status', MeterReadingStatus::Pending);

        if ($request === null) {
            return $query;
        }

        $search = trim((string) $request->string('search'));
        $filters = (array) $request->input('filter', []);

        return $query
            ->when($search !== '', fn (Builder $query) => $query->whereHas('subscriber', fn (Builder $subscriber) => $subscriber
                ->where(fn (Builder $match) => $match
                    ->where('full_name', 'like', "%{$search}%")
                    ->orWhere('account_number', 'like', "%{$search}%"))))
            ->when(filled($filters['week_start'] ?? null), fn (Builder $query) => $query->whereDate('week_start', $filters['week_start']))
            ->when($actor->isSuperAdmin() && filled($filters['branch_id'] ?? null), fn (Builder $query) => $query->where('branch_id', $filters['branch_id']));
    }

    /**
     * The Filter menu: the weeks that still have pending readings, and the
     * branch for the Super Admin.
     *
     * @return array<int, array{key: string, label: string, options: array<int, array{value: string, label: string}>}>
     */
    private function filterOptions(User $actor): array
    {
        $weeks = $this->pendingReadings($actor)
            ->reorder()
            ->select('week_start')
            ->distinct()
            ->orderByDesc('week_start')
            ->pluck('week_start')
            ->map(fn ($weekStart) => [
                'value' => $weekStart->toDateString(),
                'label' => 'الأسبوع المنتهي في الخميس '.$weekStart->copy()->addDays(6)->format('d-m-Y'),
            ]);

        $groups = [$this->filterGroup('week_start', 'الأسبوع', $weeks)];

        if ($actor->isSuperAdmin()) {
            $groups[] = $this->branchFilterGroup();
        }

        return $groups;
    }
}
