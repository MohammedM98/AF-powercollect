<?php

namespace App\Http\Controllers;

use App\Enums\MeterReadingStatus;
use App\Enums\SubscriberStatus;
use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\StoreMeterReadingRequest;
use App\Http\Requests\UpdateMeterReadingRequest;
use App\Models\Branch;
use App\Models\MeterReading;
use App\Models\Subscriber;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class MeterReadingController extends Controller
{
    use FiltersDataTable;

    private const SORTABLE = ['week_start', 'current_reading', 'consumption', 'created_at'];

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', MeterReading::class);

        $actor = auth()->user();

        $query = MeterReading::query()
            ->when(! $actor->isSuperAdmin(), fn (Builder $q) => $q->where('branch_id', $actor->branch_id))
            ->with(['subscriber', 'branch', 'recordedBy']);

        $search = trim((string) $request->string('search'));

        if ($search !== '') {
            $query->whereHas('subscriber', fn (Builder $q) => $q
                ->where('full_name', 'like', '%'.$search.'%')
                ->orWhere('account_number', 'like', '%'.$search.'%'));
        }

        $this->applyDataTableFilters($query, $request, [], self::SORTABLE, 'week_start', 'desc');
        $query->orderByDesc('id');
        $this->applyDataTableFilterSelects($query, $request, ['status', 'branch_id']);

        $weekFilter = (string) data_get($request->input('filter', []), 'week_start', '');

        if ($weekFilter !== '') {
            $query->whereDate('week_start', $weekFilter);
        }

        $readings = $query->paginate($this->dataTablePerPage($request))
            ->withQueryString()
            ->through(fn (MeterReading $reading) => [
                'id' => $reading->id,
                'subscriber_id' => $reading->subscriber_id,
                'accountNumber' => $reading->subscriber->account_number,
                'subscriberName' => $reading->subscriber->full_name,
                'branchName' => $reading->branch->name,
                'weekStart' => $reading->week_start->format('Y-m-d'),
                'weekEnd' => $reading->week_end->format('Y-m-d'),
                'previous_reading' => $reading->previous_reading,
                'current_reading' => $reading->current_reading,
                'consumption' => $reading->consumption,
                'status' => $reading->status->value,
                'statusLabel' => __($reading->status->label()),
                'notes' => $reading->notes,
                'recordedByName' => $reading->recordedBy?->name,
                'recordedAt' => $reading->created_at->format('Y-m-d H:i'),
                'canUpdate' => $actor->can('update', $reading),
            ]);

        return Inertia::render('MeterReadings/Index', [
            'readings' => $readings,
            'canCreate' => $actor->can('create', MeterReading::class),
            'filters' => $this->dataTableState($request, 'week_start', 'desc'),
            'filterOptions' => $this->filterOptions($actor),
            'weekOptions' => MeterReading::recentWeekOptions(),
            'subscriberOptions' => $actor->can('create', MeterReading::class) ? $this->subscriberOptions($actor) : [],
        ]);
    }

    /**
     * Store a newly created resource in storage. The reading only records
     * the meter — it does not charge the subscriber anything.
     */
    public function store(StoreMeterReadingRequest $request): RedirectResponse
    {
        $subscriber = Subscriber::findOrFail($request->integer('subscriber_id'));
        $weekStart = $request->weekStart();
        $previousReading = $subscriber->previousReadingBefore($weekStart);
        $currentReading = $request->integer('current_reading');

        MeterReading::create([
            'subscriber_id' => $subscriber->id,
            'branch_id' => $subscriber->branch_id,
            'week_start' => $weekStart,
            'week_end' => $weekStart->copy()->addDays(6),
            'previous_reading' => $previousReading,
            'current_reading' => $currentReading,
            'consumption' => $currentReading - $previousReading,
            'status' => MeterReadingStatus::Pending,
            'recorded_by' => $request->user()->id,
            'notes' => $request->input('notes'),
        ]);

        return back()->with('status', 'meter-reading-created');
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(UpdateMeterReadingRequest $request, MeterReading $meterReading): RedirectResponse
    {
        $currentReading = $request->integer('current_reading');

        $meterReading->update([
            'current_reading' => $currentReading,
            'consumption' => $currentReading - $meterReading->previous_reading,
            'notes' => $request->input('notes'),
        ]);

        return back()->with('status', 'meter-reading-updated');
    }

    /**
     * Active subscribers the actor may record readings for, with where
     * their meter last stood so the form can show it before saving.
     *
     * @return array<int, array{value: string, label: string, lastReading: int, lastWeekStart: ?string}>
     */
    private function subscriberOptions(User $actor): array
    {
        return Subscriber::query()
            ->where('status', SubscriberStatus::Active)
            ->when(! $actor->isSuperAdmin(), fn (Builder $q) => $q->where('branch_id', $actor->branch_id))
            ->with('latestMeterReading')
            ->orderBy('account_number')
            ->get(['id', 'account_number', 'full_name', 'initial_reading'])
            ->map(fn (Subscriber $subscriber) => [
                'value' => (string) $subscriber->id,
                'label' => "{$subscriber->account_number} — {$subscriber->full_name}",
                'lastReading' => (int) ($subscriber->latestMeterReading?->current_reading ?? $subscriber->initial_reading ?? 0),
                'lastWeekStart' => $subscriber->latestMeterReading?->week_start->toDateString(),
            ])
            ->all();
    }

    /**
     * The Filter menu's dropdown groups for the index page.
     *
     * @return array<int, array{key: string, label: string, options: array<int, array{value: string, label: string}>}>
     */
    private function filterOptions(User $actor): array
    {
        $groups = [
            [
                'key' => 'week_start',
                'label' => 'الأسبوع',
                'options' => MeterReading::recentWeekOptions(),
            ],
            [
                'key' => 'status',
                'label' => 'الحالة',
                'options' => collect(MeterReadingStatus::cases())->map(fn (MeterReadingStatus $status) => [
                    'value' => $status->value,
                    'label' => __($status->label()),
                ])->all(),
            ],
        ];

        if ($actor->isSuperAdmin()) {
            $groups[] = [
                'key' => 'branch_id',
                'label' => 'الفرع',
                'options' => Branch::orderBy('name')->get()->map(fn (Branch $branch) => [
                    'value' => (string) $branch->id,
                    'label' => $branch->name,
                ])->all(),
            ];
        }

        return $groups;
    }
}
