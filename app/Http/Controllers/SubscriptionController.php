<?php

namespace App\Http\Controllers;

use App\Enums\PermissionKey;
use App\Enums\SubscriptionStatus;
use App\Http\Concerns\BuildsSubscriptionStatement;
use App\Http\Concerns\DeletesRecords;
use App\Http\Concerns\FiltersDataTable;
use App\Http\Concerns\FiltersSubscriptionList;
use App\Http\Requests\StoreSubscriptionRequest;
use App\Http\Requests\UpdateSubscriptionRequest;
use App\Models\Branch;
use App\Models\CircuitBreaker;
use App\Models\MessageBatch;
use App\Models\MeterBox;
use App\Models\MeterReading;
use App\Models\SubArea;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
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

class SubscriptionController extends Controller
{
    use BuildsSubscriptionStatement, DeletesRecords, FiltersDataTable, FiltersSubscriptionList;

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', Subscription::class);

        $actor = auth()->user();

        $query = Subscription::query()
            ->select('subscriptions.*')
            ->selectRaw("COALESCE(NULLIF(subscription_name, ''), full_name) as display_name")
            ->visibleTo($actor)
            ->with(['branch.area', 'branch.governorate', 'meterBox.subArea', 'tariff', 'tariffSegment', 'circuitBreaker', 'standingDiscount', 'registeredBy', 'meterReadings.recordedBy'])
            ->with(['profile' => fn ($query) => $query->withCount(['subscriptions' => fn ($subscriptions) => $subscriptions->visibleTo($actor)])])
            ->withSum('transactions as outstanding_balance', 'amount')
            ->withExists(['transactions as has_subscription_fee' => fn (Builder $transactions) => $transactions->where('type', SubscriptionTransaction::TYPE_SUBSCRIPTION_FEE)]);
        $this->applySubscriptionListFilters($query, $request);

        $canRecordReadings = $actor->can('create', MeterReading::class);

        $subscriptions = $query->paginate($this->dataTablePerPage($request))
            ->withQueryString()
            ->through(fn (Subscription $subscription) => $this->indexRow($subscription, $actor, $canRecordReadings));

        return Inertia::render('Subscriptions/Index', [
            'subscriptions' => $subscriptions,
            'canCreate' => $actor->can('create', Subscription::class),
            'canRecordReadings' => $canRecordReadings,
            'bulkActions' => [
                'minimumCharge' => $actor->can('bulkUpdate', [Subscription::class, 'minimum_charge']),
                'status' => $actor->can('bulkUpdate', [Subscription::class, 'status']),
                'message' => $actor->can('create', MessageBatch::class),
            ],
            'statusOptions' => SubscriptionStatus::options(),
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
        $this->authorize('create', Subscription::class);

        return Inertia::render('Subscriptions/Create', $this->formOptions());
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(StoreSubscriptionRequest $request): RedirectResponse
    {
        $actor = auth()->user();
        $data = $request->safe()->except(['charge_subscription_fee', 'source_subscription_id']);
        $chargeSubscriptionFee = $request->boolean('charge_subscription_fee');
        $sourceSubscription = $request->sourceSubscription();

        if (! $actor->isSuperAdmin()) {
            $data['branch_id'] = $actor->branch_id;
        }

        $data['registered_by'] = $actor->id;
        $data = $this->enforceMinimumChargePermission($actor, $data);

        $subscription = DB::transaction(function () use ($data, $actor, $chargeSubscriptionFee, $sourceSubscription): Subscription {
            $subscription = new Subscription($data);

            if ($sourceSubscription !== null) {
                $profile = $sourceSubscription->profile()->lockForUpdate()->firstOrFail();
                $subscription->profile()->associate($profile);
            }

            $subscription->save();

            if ($chargeSubscriptionFee) {
                $this->chargeSubscriptionFee($subscription, $actor);
            }

            return $subscription;
        });

        $actor->notify(new ActionCompleted('subscription-created', $subscription->displayName()));

        return redirect()->route('subscriptions.index')->with('status', 'subscription-created');
    }

    /**
     * Charge the subscription's subscription fee to their account, as a
     * subscription-fee line, if it has an amount.
     */
    private function chargeSubscriptionFee(Subscription $subscription, User $actor): void
    {
        if ($subscription->subscription_fee === null || (float) $subscription->subscription_fee <= 0) {
            return;
        }

        $subscription->transactions()->create([
            'recorded_by' => $actor->id,
            'type' => SubscriptionTransaction::TYPE_SUBSCRIPTION_FEE,
            'source_key' => 'subscription-fee:'.$subscription->id,
            'amount' => $subscription->subscription_fee,
            'currency_amount' => $subscription->subscription_fee,
        ]);
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Subscription $subscription): InertiaResponse
    {
        $this->authorize('update', $subscription);

        return Inertia::render('Subscriptions/Edit', [
            'subscription' => [
                ...$this->editableFields($subscription),
                'subscriptionCount' => $subscription->profile->subscriptions()->visibleTo(auth()->user())->count(),
            ],
            ...$this->formOptions(),
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(UpdateSubscriptionRequest $request, Subscription $subscription): RedirectResponse
    {
        $data = $request->safe()->except(['charge_subscription_fee']);
        $data = $this->enforceMinimumChargePermission(auth()->user(), $data, $subscription);
        // Only a subscription without the fee on the account is validated for charging it.
        $chargeSubscriptionFee = (bool) $request->validated('charge_subscription_fee', false);

        // Activating a subscription who was not active starts their subscription today, unless a date was picked.
        if ($data['status'] === SubscriptionStatus::Active->value
            && $subscription->status !== SubscriptionStatus::Active
            && ($data['subscription_date'] ?? null) === $subscription->subscription_date?->format('Y-m-d')) {
            $data['subscription_date'] = DailySeries::today()->toDateString();
        }

        DB::transaction(function () use ($subscription, $data, $chargeSubscriptionFee, $request): void {
            $subscription->profile()->lockForUpdate()->firstOrFail();
            $subscription->update($data);

            if ($chargeSubscriptionFee) {
                $this->chargeSubscriptionFee($subscription, $request->user());
            }
        });
        $request->user()->notify(new ActionCompleted('subscription-updated', $subscription->displayName()));

        return redirect()->route('subscriptions.index')->with('status', 'subscription-updated');
    }

    /**
     * Delete the subscription, once nothing uses it any more.
     */
    public function destroy(Request $request, Subscription $subscription): RedirectResponse
    {
        return $this->deleteRecord($request, $subscription, 'subscription-deleted', $subscription->displayName(), fn () => $subscription->deleteWithSubscriptionFee());
    }

    /**
     * One row of the subscriptions list: the editable fields, plus what the
     * table, the details window and the reading form display.
     *
     * @return array<string, mixed>
     */
    private function indexRow(Subscription $subscription, User $actor, bool $canRecordReadings): array
    {
        $readings = $subscription->meterReadings->sortByDesc('week_start')->values();
        $latestReading = $readings->first();

        return [
            ...$this->editableFields($subscription),
            'branchName' => $subscription->branch->name,
            'governorateName' => $subscription->branch->governorate?->name,
            'areaName' => $subscription->branch->area?->name,
            'meterBoxNumber' => $subscription->meterBox?->box_number,
            'meterBoxName' => $subscription->meterBox?->displayName(),
            'subAreaName' => $subscription->meterBox?->subArea?->name,
            'tariffCategoryLabel' => __($subscription->tariff->category->label()),
            'tariffSegmentName' => $subscription->tariffSegment?->name,
            'tariffRate' => $subscription->tariff->rate,
            'circuitBreakerAmpere' => $subscription->circuitBreaker?->ampere,
            'standingDiscountSummary' => $subscription->standingDiscount?->summary(),
            'standingDiscount' => $subscription->standingDiscount ? ['method' => $subscription->standingDiscount->method->value, 'value' => $subscription->standingDiscount->value] : null,
            'statusLabel' => __($subscription->status->label()),
            'registeredByName' => $subscription->registeredBy?->name,
            'outstandingBalance' => $subscription->outstanding_balance ?? '0.00',
            'weeklyMinimumPayment' => $subscription->weeklyMinimumPayment(),
            'subscriptionCount' => $subscription->profile?->subscriptions_count ?? 1,
            'meterReadings' => $readings->map(fn (MeterReading $reading) => $this->statementReading($reading, $actor)),
            'lastReading' => (float) ($latestReading?->current_reading ?? $subscription->initial_reading ?? 0),
            'lastReadingWeekStart' => $latestReading?->week_start->format('Y-m-d'),
            'canRecordReading' => $canRecordReadings && $subscription->status === SubscriptionStatus::Active,
            'canUpdate' => $actor->can('update', $subscription),
            'canDelete' => $actor->can('delete', $subscription),
            'canRecordPayment' => $actor->can('recordPayment', $subscription),
            'canAdjustBalance' => $actor->can('adjustBalance', $subscription),
        ];
    }

    /**
     * One weekly reading as listed in a subscription's statement.
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
     * Whether the actor may set a subscription's minimum charge by hand
     * instead of taking the circuit breaker's.
     */
    private function canEditMinimumCharge(User $actor): bool
    {
        return $actor->hasPermission(PermissionKey::UpdateSubscriptionMinimumCharge);
    }

    /**
     * Without the dedicated permission, minimum_charge is never taken from
     * the request as-is — it always tracks the chosen circuit breaker's own
     * minimum_payment (or, on update with no circuit breaker chosen, stays
     * whatever the subscription already had). This mirrors the frontend's
     * locked field, but enforced server-side so it can't be bypassed by
     * crafting a raw request.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function enforceMinimumChargePermission(User $actor, array $data, ?Subscription $existing = null): array
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
     * The full set of a subscription's editable fields — used both for the
     * dedicated edit page and for the edit modal's initial form data on
     * the index page, so both stay backed by the same shape.
     *
     * @return array<string, mixed>
     */
    private function editableFields(Subscription $subscription): array
    {
        return [
            'id' => $subscription->id,
            'account_number' => $subscription->account_number,
            'subscriber_number' => $subscription->profile?->subscriber_number,
            'full_name' => $subscription->full_name,
            'subscription_name' => $subscription->subscription_name,
            'display_name' => $subscription->displayName(),
            'national_id' => $subscription->national_id,
            'phone' => $subscription->phone,
            'subscription_phone' => $subscription->subscription_phone,
            'contact_phone' => $subscription->contactPhone(),
            'address' => $subscription->address,
            'meter_box_id' => $subscription->meter_box_id,
            'tariff_id' => $subscription->tariff_id,
            'tariff_segment_id' => $subscription->tariff_segment_id,
            'branch_id' => $subscription->branch_id,
            'status' => $subscription->status->value,
            'accounting_type' => $subscription->accounting_type->value,
            'circuit_breaker_id' => $subscription->circuit_breaker_id,
            'minimum_charge' => $subscription->minimum_charge,
            'initial_reading' => $subscription->initial_reading,
            'subscription_fee' => $subscription->subscription_fee,
            // Whether the fee is already on the account: if not, the edit form can still charge it.
            // Whether the subscription has ever been active: then they can be disconnected but not put back to waiting.
            'has_been_active' => $subscription->activated_at !== null,
            'subscription_fee_charged' => (bool) ($subscription->has_subscription_fee ?? $subscription->hasSubscriptionFeeCharge()),
            'subscription_date' => $subscription->subscription_date?->format('Y-m-d'),
            'notes' => $subscription->notes,
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
            // Any subscription can be given any customer segment, whatever their tariff.
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
     * visible subscriptions have, smallest first.
     *
     * @return array{key: string, label: string, options: array<int, array{value: string, label: string}>}
     */
    private function minimumChargeFilterGroup(User $actor): array
    {
        return $this->filterGroup('minimum_charge', 'الحد الأدنى', Subscription::query()
            ->visibleTo($actor)
            ->whereNotNull('minimum_charge')
            ->distinct()
            ->orderBy('minimum_charge')
            ->pluck('minimum_charge')
            ->map(fn ($charge) => ['value' => (string) (float) $charge, 'label' => SubscriptionTransaction::formatAmount($charge).' شيكل']));
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
            $this->filterGroup('status', 'الحالة', SubscriptionStatus::options()),
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
