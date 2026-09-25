<?php

namespace App\Http\Controllers;

use App\Enums\PermissionKey;
use App\Enums\SubscriberStatus;
use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\StoreSubscriberRequest;
use App\Http\Requests\UpdateSubscriberRequest;
use App\Models\Branch;
use App\Models\CircuitBreaker;
use App\Models\MeterBox;
use App\Models\MeterReading;
use App\Models\SubArea;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\Tariff;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class SubscriberController extends Controller
{
    use FiltersDataTable;

    private const SORTABLE = ['account_number', 'full_name', 'status', 'created_at'];

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', Subscriber::class);

        $actor = auth()->user();

        $query = Subscriber::query()
            ->visibleTo($actor)
            ->with(['branch.area', 'branch.governorate', 'meterBox.subArea', 'tariff', 'circuitBreaker', 'registeredBy', 'transactions.recordedBy', 'meterReadings.recordedBy'])
            ->withSum('transactions as outstanding_balance', 'amount');
        $this->applyDataTableFilters($query, $request, ['full_name', 'phone', 'account_number'], self::SORTABLE, 'full_name');
        $this->applyDataTableFilterSelects($query, $request, ['status', 'branch_id', 'tariff_id', 'meter_box_id']);

        $canRecordReadings = $actor->can('create', MeterReading::class);

        $subscribers = $query->paginate($this->dataTablePerPage($request))
            ->withQueryString()
            ->through(fn (Subscriber $subscriber) => $this->indexRow($subscriber, $actor, $canRecordReadings));

        return Inertia::render('Subscribers/Index', [
            'subscribers' => $subscribers,
            'canCreate' => $actor->can('create', Subscriber::class),
            'filters' => $this->dataTableState($request, 'full_name'),
            'filterOptions' => $this->filterOptions($actor),
            'readingWeekOptions' => MeterReading::recentWeekOptions(),
            ...$this->formOptions(),
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create(): InertiaResponse
    {
        $this->authorize('create', Subscriber::class);

        return Inertia::render('Subscribers/Create', $this->formOptions());
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(StoreSubscriberRequest $request): RedirectResponse
    {
        $actor = auth()->user();
        $data = $request->validated();

        if (! $actor->isSuperAdmin()) {
            $data['branch_id'] = $actor->branch_id;
        }

        $data['registered_by'] = $actor->id;
        $data = $this->enforceMinimumChargePermission($actor, $data);

        DB::transaction(function () use ($data, $actor): void {
            $subscriber = Subscriber::create($data);

            if ($subscriber->subscription_fee !== null && (float) $subscriber->subscription_fee > 0) {
                $subscriber->transactions()->create([
                    'recorded_by' => $actor->id,
                    'type' => 'subscription_fee',
                    'source_key' => 'subscription-fee:'.$subscriber->id,
                    'amount' => $subscriber->subscription_fee,
                ]);
            }
        });

        return redirect()->route('subscribers.index')->with('status', 'subscriber-created');
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Subscriber $subscriber): InertiaResponse
    {
        $this->authorize('update', $subscriber);

        return Inertia::render('Subscribers/Edit', [
            'subscriber' => $this->editableFields($subscriber),
            ...$this->formOptions(),
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(UpdateSubscriberRequest $request, Subscriber $subscriber): RedirectResponse
    {
        $data = $request->validated();
        $data = $this->enforceMinimumChargePermission(auth()->user(), $data, $subscriber);

        $subscriber->update($data);

        return redirect()->route('subscribers.index')->with('status', 'subscriber-updated');
    }

    /**
     * One row of the subscribers list: the editable fields, plus what the
     * table, the statement and the reading form display.
     *
     * @return array<string, mixed>
     */
    private function indexRow(Subscriber $subscriber, User $actor, bool $canRecordReadings): array
    {
        $readings = $subscriber->meterReadings->sortByDesc('week_start')->values();
        $latestReading = $readings->first();

        return [
            ...$this->editableFields($subscriber),
            'branchName' => $subscriber->branch->name,
            'governorateName' => $subscriber->branch->governorate?->name,
            'areaName' => $subscriber->branch->area?->name,
            'meterBoxNumber' => $subscriber->meterBox?->box_number,
            'subAreaName' => $subscriber->meterBox?->subArea?->name,
            'tariffCategoryLabel' => __($subscriber->tariff->category->label()),
            'tariffRate' => $subscriber->tariff->rate,
            'circuitBreakerAmpere' => $subscriber->circuitBreaker?->ampere,
            'statusLabel' => __($subscriber->status->label()),
            'registeredByName' => $subscriber->registeredBy?->name,
            'outstandingBalance' => $subscriber->outstanding_balance ?? '0.00',
            'transactions' => $subscriber->transactions->sortByDesc('id')->values()->map(fn (SubscriberTransaction $transaction) => [
                'id' => $transaction->id,
                'type' => $transaction->type,
                'amount' => $transaction->amount,
                'recordedByName' => $transaction->recordedBy?->name,
                'recordedAt' => $transaction->created_at->format('Y-m-d H:i'),
            ]),
            'meterReadings' => $readings->map(fn (MeterReading $reading) => $this->statementReading($reading, $actor)),
            'lastReading' => (int) ($latestReading?->current_reading ?? $subscriber->initial_reading ?? 0),
            'lastReadingWeekStart' => $latestReading?->week_start->format('Y-m-d'),
            'canRecordReading' => $canRecordReadings && $subscriber->status === SubscriberStatus::Active,
            'canUpdate' => $actor->can('update', $subscriber),
        ];
    }

    /**
     * One weekly reading as listed in a subscriber's statement.
     *
     * @return array<string, mixed>
     */
    private function statementReading(MeterReading $reading, User $actor): array
    {
        return [
            'id' => $reading->id,
            'weekStart' => $reading->week_start->format('Y-m-d'),
            'weekEnd' => $reading->week_end->format('Y-m-d'),
            'previous_reading' => $reading->previous_reading,
            'current_reading' => $reading->current_reading,
            'consumption' => $reading->consumption,
            'amountDue' => $reading->amount_due,
            'status' => $reading->status->value,
            'statusLabel' => __($reading->status->label()),
            'notes' => $reading->notes,
            'recordedByName' => $reading->recordedBy?->name,
            'recordedAt' => $reading->created_at->format('Y-m-d H:i'),
            'canUpdate' => $actor->can('update', $reading),
        ];
    }

    /**
     * Whether the actor may set a subscriber's minimum charge by hand
     * instead of taking the circuit breaker's.
     */
    private function canEditMinimumCharge(User $actor): bool
    {
        return $actor->hasPermission(PermissionKey::UpdateSubscriberMinimumCharge);
    }

    /**
     * Without the dedicated permission, minimum_charge is never taken from
     * the request as-is — it always tracks the chosen circuit breaker's own
     * minimum_payment (or, on update with no circuit breaker chosen, stays
     * whatever the subscriber already had). This mirrors the frontend's
     * locked field, but enforced server-side so it can't be bypassed by
     * crafting a raw request.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function enforceMinimumChargePermission(User $actor, array $data, ?Subscriber $existing = null): array
    {
        if ($this->canEditMinimumCharge($actor)) {
            return $data;
        }

        $circuitBreaker = ! empty($data['circuit_breaker_id']) ? CircuitBreaker::find($data['circuit_breaker_id']) : null;

        $data['minimum_charge'] = match (true) {
            $circuitBreaker !== null => $circuitBreaker->minimum_payment,
            $existing !== null => $existing->minimum_charge,
            default => 0,
        };

        return $data;
    }

    /**
     * The full set of a subscriber's editable fields — used both for the
     * dedicated edit page and for the edit modal's initial form data on
     * the index page, so both stay backed by the same shape.
     *
     * @return array<string, mixed>
     */
    private function editableFields(Subscriber $subscriber): array
    {
        return [
            'id' => $subscriber->id,
            'account_number' => $subscriber->account_number,
            'full_name' => $subscriber->full_name,
            'national_id' => $subscriber->national_id,
            'phone' => $subscriber->phone,
            'address' => $subscriber->address,
            'meter_box_id' => $subscriber->meter_box_id,
            'tariff_id' => $subscriber->tariff_id,
            'branch_id' => $subscriber->branch_id,
            'status' => $subscriber->status->value,
            'circuit_breaker_id' => $subscriber->circuit_breaker_id,
            'minimum_charge' => $subscriber->minimum_charge,
            'initial_reading' => $subscriber->initial_reading,
            'subscription_fee' => $subscriber->subscription_fee,
            'subscription_date' => $subscriber->subscription_date?->format('Y-m-d'),
            'notes' => $subscriber->notes,
        ];
    }

    /**
     * The branch/meter-box/tariff options for the create/edit forms, and
     * whether the actor may choose the branch themselves. A meter box's
     * area/governorate always come from its branch, but its sub-area
     * ("منطقة 2") is its own column, so the form narrows meter boxes down
     * via branch → sub-area, same as the Meter Boxes resource itself.
     *
     * @return array{branches: Collection, meterBoxes: Collection, tariffs: Collection, subAreas: Collection, circuitBreakers: Collection, canChooseBranch: bool, currentBranchAreaId: ?int, currentBranchAreaName: ?string, canEditMinimumCharge: bool}
     */
    private function formOptions(): array
    {
        $actor = auth()->user();
        $canChooseBranch = $actor->isSuperAdmin();

        $branches = $canChooseBranch ? Branch::with('area')->orderBy('name')->get() : collect();

        $meterBoxes = MeterBox::query()
            ->visibleTo($actor)
            ->with('branch')
            ->orderBy('box_number')
            ->get()
            ->map(fn (MeterBox $box) => [
                'id' => $box->id,
                'name' => $box->name,
                'box_number' => $box->box_number,
                'branchName' => $box->branch->name,
                'branch_id' => $box->branch_id,
                'sub_area_id' => $box->sub_area_id,
            ]);

        $tariffs = Tariff::orderBy('category')->get()->map(fn (Tariff $tariff) => [
            'id' => $tariff->id,
            'categoryLabel' => __($tariff->category->label()),
            'rate' => $tariff->rate,
        ]);

        return [
            'branches' => $branches,
            'meterBoxes' => $meterBoxes,
            'tariffs' => $tariffs,
            'subAreas' => SubArea::orderBy('name')->get(),
            'circuitBreakers' => CircuitBreaker::orderBy('ampere')->get(),
            'canChooseBranch' => $canChooseBranch,
            'currentBranchAreaId' => $canChooseBranch ? null : $actor->branch?->area_id,
            'currentBranchAreaName' => $canChooseBranch ? null : $actor->branch?->area?->name,
            'canEditMinimumCharge' => $this->canEditMinimumCharge($actor),
        ];
    }

    /**
     * The Filter menu's dropdown groups for the index page. The branch
     * filter only makes sense for a Super Admin — everyone else's list is
     * already scoped to their own single branch.
     *
     * @return array<int, array{key: string, label: string, options: array<int, array{value: string, label: string}>}>
     */
    private function filterOptions(User $actor): array
    {
        $meterBoxes = MeterBox::query()->visibleTo($actor)->with('branch')->orderBy('box_number')->get();

        $groups = [
            $this->filterGroup('status', 'الحالة', SubscriberStatus::options()),
            $this->filterGroup('tariff_id', 'نوع الاشتراك', $this->modelOptions(
                Tariff::orderBy('category')->get(),
                fn (Tariff $tariff) => __($tariff->category->label()),
            )),
            $this->filterGroup('meter_box_id', 'الطبلون', $this->modelOptions(
                $meterBoxes,
                fn (MeterBox $box) => $actor->isSuperAdmin() ? "{$box->box_number} — {$box->branch->name}" : $box->box_number,
            )),
        ];

        if ($actor->isSuperAdmin()) {
            $groups[] = $this->branchFilterGroup();
        }

        return $groups;
    }
}
