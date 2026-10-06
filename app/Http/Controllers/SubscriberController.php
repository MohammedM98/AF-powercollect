<?php

namespace App\Http\Controllers;

use App\Enums\PermissionKey;
use App\Enums\SubscriberStatus;
use App\Http\Concerns\BuildsSubscriberStatement;
use App\Http\Concerns\DeletesRecords;
use App\Http\Concerns\FiltersDataTable;
use App\Http\Concerns\FiltersSubscriberList;
use App\Http\Requests\StoreSubscriberRequest;
use App\Http\Requests\UpdateSubscriberRequest;
use App\Models\Branch;
use App\Models\CircuitBreaker;
use App\Models\MessageBatch;
use App\Models\MeterBox;
use App\Models\MeterReading;
use App\Models\SubArea;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\Tariff;
use App\Models\TariffSegment;
use App\Models\User;
use App\Notifications\ActionCompleted;
use App\Support\DailySeries;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class SubscriberController extends Controller
{
    use BuildsSubscriberStatement, DeletesRecords, FiltersDataTable, FiltersSubscriberList;

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', Subscriber::class);

        $actor = auth()->user();

        $query = Subscriber::query()
            ->select('subscribers.*')
            ->selectRaw("COALESCE(NULLIF(subscription_name, ''), full_name) as display_name")
            ->visibleTo($actor)
            ->with(['branch.area', 'branch.governorate', 'meterBox.subArea', 'tariff', 'tariffSegment', 'circuitBreaker', 'standingDiscount', 'registeredBy', 'meterReadings.recordedBy'])
            ->with(['profile' => fn ($query) => $query->withCount(['subscriptions' => fn ($subscriptions) => $subscriptions->visibleTo($actor)])])
            ->withSum('transactions as outstanding_balance', 'amount')
            ->withExists(['transactions as has_subscription_fee' => fn (Builder $transactions) => $transactions->where('type', SubscriberTransaction::TYPE_SUBSCRIPTION_FEE)]);
        $this->applySubscriberListFilters($query, $request);

        $canRecordReadings = $actor->can('create', MeterReading::class);

        $subscribers = $query->paginate($this->dataTablePerPage($request))
            ->withQueryString()
            ->through(fn (Subscriber $subscriber) => $this->indexRow($subscriber, $actor, $canRecordReadings));

        return Inertia::render('Subscribers/Index', [
            'subscribers' => $subscribers,
            'canCreate' => $actor->can('create', Subscriber::class),
            'canRecordReadings' => $canRecordReadings,
            'bulkActions' => [
                'minimumCharge' => $actor->can('bulkUpdate', [Subscriber::class, 'minimum_charge']),
                'status' => $actor->can('bulkUpdate', [Subscriber::class, 'status']),
                'message' => $actor->can('create', MessageBatch::class),
            ],
            'statusOptions' => SubscriberStatus::options(),
            'filters' => $this->dataTableState($request, 'display_name'),
            'filterOptions' => $this->filterOptions($actor),
            // Only the Super Admin may enter a reading for an earlier week.
            'readingWeekOptions' => MeterReading::recentWeekOptions($actor->isSuperAdmin() ? 8 : 1),
            'statement' => fn () => $this->requestedStatement($request, $actor),
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
        $data = $request->safe()->except(['charge_subscription_fee', 'source_subscriber_id']);
        $chargeSubscriptionFee = $request->boolean('charge_subscription_fee');
        $sourceSubscriber = $request->sourceSubscriber();

        if (! $actor->isSuperAdmin()) {
            $data['branch_id'] = $actor->branch_id;
        }

        $data['registered_by'] = $actor->id;
        $data = $this->enforceMinimumChargePermission($actor, $data);

        $subscriber = DB::transaction(function () use ($data, $actor, $chargeSubscriptionFee, $sourceSubscriber): Subscriber {
            $subscriber = new Subscriber($data);

            if ($sourceSubscriber !== null) {
                $profile = $sourceSubscriber->profile()->lockForUpdate()->firstOrFail();
                $subscriber->profile()->associate($profile);
            }

            $subscriber->save();

            if ($chargeSubscriptionFee) {
                $this->chargeSubscriptionFee($subscriber, $actor);
            }

            return $subscriber;
        });

        $actor->notify(new ActionCompleted('subscriber-created', $subscriber->displayName()));

        return redirect()->route('subscribers.index')->with('status', 'subscriber-created');
    }

    /**
     * Charge the subscriber's subscription fee to their account, as a
     * subscription-fee line, if it has an amount.
     */
    private function chargeSubscriptionFee(Subscriber $subscriber, User $actor): void
    {
        if ($subscriber->subscription_fee === null || (float) $subscriber->subscription_fee <= 0) {
            return;
        }

        $subscriber->transactions()->create([
            'recorded_by' => $actor->id,
            'type' => SubscriberTransaction::TYPE_SUBSCRIPTION_FEE,
            'source_key' => 'subscription-fee:'.$subscriber->id,
            'amount' => $subscriber->subscription_fee,
            'currency_amount' => $subscriber->subscription_fee,
        ]);
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Subscriber $subscriber): InertiaResponse
    {
        $this->authorize('update', $subscriber);

        return Inertia::render('Subscribers/Edit', [
            'subscriber' => [
                ...$this->editableFields($subscriber),
                'subscriptionCount' => $subscriber->profile->subscriptions()->visibleTo(auth()->user())->count(),
            ],
            ...$this->formOptions(),
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(UpdateSubscriberRequest $request, Subscriber $subscriber): RedirectResponse
    {
        $data = $request->safe()->except(['charge_subscription_fee']);
        $data = $this->enforceMinimumChargePermission(auth()->user(), $data, $subscriber);
        // Only a subscriber without the fee on the account is validated for charging it.
        $chargeSubscriptionFee = (bool) $request->validated('charge_subscription_fee', false);

        // Activating a subscriber who was not active starts their subscription today, unless a date was picked.
        if ($data['status'] === SubscriberStatus::Active->value
            && $subscriber->status !== SubscriberStatus::Active
            && ($data['subscription_date'] ?? null) === $subscriber->subscription_date?->format('Y-m-d')) {
            $data['subscription_date'] = DailySeries::today()->toDateString();
        }

        DB::transaction(function () use ($subscriber, $data, $chargeSubscriptionFee, $request): void {
            $subscriber->profile()->lockForUpdate()->firstOrFail();
            $subscriber->update($data);

            if ($chargeSubscriptionFee) {
                $this->chargeSubscriptionFee($subscriber, $request->user());
            }
        });
        $request->user()->notify(new ActionCompleted('subscriber-updated', $subscriber->displayName()));

        return redirect()->route('subscribers.index')->with('status', 'subscriber-updated');
    }

    /**
     * Delete the subscriber, once nothing uses it any more.
     */
    public function destroy(Request $request, Subscriber $subscriber): RedirectResponse
    {
        return $this->deleteRecord($request, $subscriber, 'subscriber-deleted', $subscriber->displayName(), fn () => $subscriber->deleteWithSubscriptionFee());
    }

    /**
     * One row of the subscribers list: the editable fields, plus what the
     * table, the details window and the reading form display.
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
            'meterBoxName' => $subscriber->meterBox?->displayName(),
            'subAreaName' => $subscriber->meterBox?->subArea?->name,
            'tariffCategoryLabel' => __($subscriber->tariff->category->label()),
            'tariffSegmentName' => $subscriber->tariffSegment?->name,
            'tariffRate' => $subscriber->tariff->rate,
            'circuitBreakerAmpere' => $subscriber->circuitBreaker?->ampere,
            'standingDiscountSummary' => $subscriber->standingDiscount?->summary(),
            'statusLabel' => __($subscriber->status->label()),
            'registeredByName' => $subscriber->registeredBy?->name,
            'outstandingBalance' => $subscriber->outstanding_balance ?? '0.00',
            'weeklyMinimumPayment' => $subscriber->weeklyMinimumPayment(),
            'subscriptionCount' => $subscriber->profile?->subscriptions_count ?? 1,
            'meterReadings' => $readings->map(fn (MeterReading $reading) => $this->statementReading($reading, $actor)),
            'lastReading' => (float) ($latestReading?->current_reading ?? $subscriber->initial_reading ?? 0),
            'lastReadingWeekStart' => $latestReading?->week_start->format('Y-m-d'),
            'canRecordReading' => $canRecordReadings && $subscriber->status === SubscriberStatus::Active,
            'canUpdate' => $actor->can('update', $subscriber),
            'canDelete' => $actor->can('delete', $subscriber),
            'canRecordPayment' => $actor->can('recordPayment', $subscriber),
            'canAdjustBalance' => $actor->can('adjustBalance', $subscriber),
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
            'discountAmount' => $reading->discount_amount,
            'unitPrice' => $reading->unit_price,
            'minimumPayment' => $reading->minimum_payment,
            'status' => $reading->status->value,
            'statusLabel' => __($reading->status->label()),
            'notes' => $reading->notes,
            'recordedByName' => $reading->recordedBy?->name,
            'recordedAt' => $reading->created_at->copy()->setTimezone(config('app.business_timezone'))->format('Y-m-d H:i'),
            'recordedSource' => $reading->mobile_operation_id !== null ? 'app' : 'web',
            'minimumApplied' => $reading->discount_method === null && (float) $reading->reading_fee < (float) $reading->minimum_payment,
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
            'subscriber_number' => $subscriber->profile?->subscriber_number,
            'full_name' => $subscriber->full_name,
            'subscription_name' => $subscriber->subscription_name,
            'display_name' => $subscriber->displayName(),
            'national_id' => $subscriber->national_id,
            'phone' => $subscriber->phone,
            'subscription_phone' => $subscriber->subscription_phone,
            'contact_phone' => $subscriber->contactPhone(),
            'address' => $subscriber->address,
            'meter_box_id' => $subscriber->meter_box_id,
            'tariff_id' => $subscriber->tariff_id,
            'tariff_segment_id' => $subscriber->tariff_segment_id,
            'branch_id' => $subscriber->branch_id,
            'status' => $subscriber->status->value,
            'circuit_breaker_id' => $subscriber->circuit_breaker_id,
            'minimum_charge' => $subscriber->minimum_charge,
            'initial_reading' => $subscriber->initial_reading,
            'subscription_fee' => $subscriber->subscription_fee,
            // Whether the fee is already on the account: if not, the edit form can still charge it.
            // Whether the subscriber has ever been active: then they can be disconnected but not put back to waiting.
            'has_been_active' => $subscriber->activated_at !== null,
            'subscription_fee_charged' => (bool) ($subscriber->has_subscription_fee ?? $subscriber->hasSubscriptionFeeCharge()),
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
     * @return array{branches: Collection, meterBoxes: Collection, tariffs: Collection, segments: Collection, subAreas: Collection, circuitBreakers: Collection, canChooseBranch: bool, currentBranchAreaId: ?int, currentBranchAreaName: ?string, canEditMinimumCharge: bool}
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
                'name_suffix' => $box->name_suffix,
                'label' => $box->label(),
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
            // Any subscriber can be given any customer segment, whatever their tariff.
            'segments' => TariffSegment::orderBy('name')->get(['id', 'name']),
            'subAreas' => SubArea::orderBy('name')->get(),
            'circuitBreakers' => CircuitBreaker::orderBy('ampere')->get(),
            'canChooseBranch' => $canChooseBranch,
            'currentBranchAreaId' => $canChooseBranch ? null : $actor->branch?->area_id,
            'currentBranchAreaName' => $canChooseBranch ? null : $actor->branch?->area?->name,
            'canEditMinimumCharge' => $this->canEditMinimumCharge($actor),
        ];
    }

    /**
     * The "Minimum charge" dropdown: each minimum charge (الحد الأدنى) the
     * visible subscribers have, smallest first.
     *
     * @return array{key: string, label: string, options: array<int, array{value: string, label: string}>}
     */
    private function minimumChargeFilterGroup(User $actor): array
    {
        return $this->filterGroup('minimum_charge', 'الحد الأدنى', Subscriber::query()
            ->visibleTo($actor)
            ->whereNotNull('minimum_charge')
            ->distinct()
            ->orderBy('minimum_charge')
            ->pluck('minimum_charge')
            ->map(fn ($charge) => ['value' => (string) (float) $charge, 'label' => SubscriberTransaction::formatAmount($charge).' شيكل']));
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
        $meterBoxes = MeterBox::query()->visibleTo($actor)->with(['branch', 'subArea'])->orderBy('box_number')->get();

        $groups = [
            $this->filterGroup('status', 'الحالة', SubscriberStatus::options()),
            $this->filterGroup('tariff_id', 'نوع الاشتراك', $this->modelOptions(
                Tariff::orderBy('category')->get(),
                fn (Tariff $tariff) => __($tariff->category->label()),
            )),
            $this->filterGroup('tariff_segment_id', 'تصنيف الزبائن', $this->modelOptions(TariffSegment::orderBy('name')->get(), 'name')),
            $this->subAreaFilterGroup(SubArea::query()->visibleTo($actor)->orderBy('name')->get()),
            ...$this->meterBoxFilterGroups(
                $meterBoxes,
                $actor->isSuperAdmin() ? fn (MeterBox $box) => $box->branch->name : null,
            ),
            $this->circuitBreakerFilterGroup(),
            $this->minimumChargeFilterGroup($actor),
        ];

        if ($actor->isSuperAdmin()) {
            $groups[] = $this->branchFilterGroup();
        }

        return $groups;
    }
}
