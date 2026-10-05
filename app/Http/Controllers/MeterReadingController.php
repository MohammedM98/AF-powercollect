<?php

namespace App\Http\Controllers;

use App\Enums\MeterReadingStatus;
use App\Enums\PermissionKey;
use App\Enums\ReadingEntryMode;
use App\Enums\SubscriberStatus;
use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\ApproveMeterReadingsRequest;
use App\Http\Requests\StoreMeterReadingRequest;
use App\Http\Requests\UpdateMeterReadingRequest;
use App\Models\Area;
use App\Models\MeterBox;
use App\Models\MeterReading;
use App\Models\ReadingEntrySetting;
use App\Models\StandingDiscount;
use App\Models\SubArea;
use App\Models\Subscriber;
use App\Models\Tariff;
use App\Models\User;
use App\Notifications\ActionCompleted;
use App\Notifications\ReadingNeedsReapproval;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class MeterReadingController extends Controller
{
    use FiltersDataTable;

    /**
     * Sortable sheet columns — the reading columns are computed per row for
     * the chosen week by withSheetColumns().
     */
    private const SORTABLE = ['full_name', 'account_number', 'meter_box_number', 'last_reading', 'current_reading', 'consumption', 'amount_due'];

    /**
     * The weekly reading sheet: one row per active subscriber for the
     * chosen week, with their last reading, this week's reading (if
     * entered), and what that week costs them.
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', MeterReading::class);

        $actor = auth()->user();
        $weekStart = $this->selectedWeek($request);
        $week = $weekStart->toDateString();

        $query = $this->subscribersInScope($actor)
            ->with([
                'tariff',
                'circuitBreaker',
                'standingDiscount',
                'meterBox.subArea',
                'meterReadings' => fn ($q) => $q->whereDate('week_start', '<=', $week)->orderByDesc('week_start')
                    ->with(['recordedBy:id,name', 'approvedBy:id,name']),
            ])
            ->withExists(['meterReadings as has_later_week' => fn ($q) => $q->whereDate('week_start', '>', $week)]);

        $this->withSheetColumns($query, $week);
        $this->applyMeterBoxSort($query, $request);
        $this->applyDataTableFilters($query, $request, ['full_name', 'subscription_name', 'account_number', 'phone', 'subscription_phone'], self::SORTABLE, 'full_name');
        $query->orderBy('subscribers.id');
        $this->applyDataTableFilterSelects($query, $request, ['branch_id', 'meter_box_id', 'tariff_id']);
        $this->applyMeterBoxNameFilter($query, $request);
        $this->applySheetFilters($query, $request, $week, includeStatus: false);
        $statusSummary = $this->statusSummary($query, $week);
        $this->applySheetStatusFilters($query, $request, $week);

        $enteredThisWeek = fn (Builder $q) => $q->whereDate('week_start', $week);

        $rows = $query->paginate($this->dataTablePerPage($request, 25))
            ->withQueryString()
            ->through(fn (Subscriber $subscriber) => $this->sheetRow($subscriber, $weekStart, $actor));

        $scope = $this->subscribersInScope($actor);
        $canApprove = $actor->can('approveAny', MeterReading::class);

        return Inertia::render('MeterReadings/Index', [
            'rows' => $rows,
            'week' => $week,
            'weekEnd' => MeterReading::weekEndFor($weekStart)->toDateString(),
            'weekOptions' => MeterReading::recentWeekOptions(),
            'summary' => [
                'total' => (clone $scope)->count(),
                'entered' => (clone $scope)->whereHas('meterReadings', $enteredThisWeek)->count(),
                'amountDue' => number_format((float) MeterReading::query()
                    ->whereIn('subscriber_id', (clone $scope)->select('id'))
                    ->whereDate('week_start', $week)
                    ->sum('amount_due'), 2, '.', ''),
            ],
            'canRecord' => $actor->can('create', MeterReading::class),
            'canApprove' => $canApprove,
            'statusSummary' => $statusSummary,
            'pendingApproval' => $canApprove ? $this->pendingApprovalSummary($request, $actor, $week) : null,
            // The actor could record now, just not in this earlier week.
            'weekIsViewOnly' => $actor->can('create', MeterReading::class) && ! $actor->can('create', [MeterReading::class, $weekStart]),
            'entryWindow' => $this->entryWindow($actor),
            'filters' => $this->dataTableState($request, 'full_name', 'asc', 25),
            'filterOptions' => $this->filterOptions($actor),
        ]);
    }

    /**
     * Store a newly created resource in storage. The reading records the
     * meter and what the week costs, with the subscriber's standing
     * discount taken off, but does not charge the subscriber's balance.
     */
    public function store(StoreMeterReadingRequest $request): RedirectResponse
    {
        $subscriber = Subscriber::with(['tariff', 'circuitBreaker', 'standingDiscount'])->findOrFail($request->integer('subscriber_id'));
        $weekStart = $request->weekStart();
        $previousReading = $subscriber->previousReadingBefore($weekStart);
        $currentReading = $request->float('current_reading');
        $consumption = MeterReading::consumptionBetween($previousReading, $currentReading);
        $unitPrice = (string) $subscriber->tariff->rate;
        $minimumPayment = $subscriber->weeklyMinimumPayment();
        $discount = $subscriber->standingDiscount;

        MeterReading::create([
            'subscriber_id' => $subscriber->id,
            'branch_id' => $subscriber->branch_id,
            'week_start' => $weekStart,
            'week_end' => MeterReading::weekEndFor($weekStart),
            'previous_reading' => $previousReading,
            'current_reading' => $currentReading,
            'consumption' => $consumption,
            'unit_price' => $unitPrice,
            'minimum_payment' => $minimumPayment,
            'discount_method' => $discount?->method,
            'discount_value' => $discount?->value,
            'discount_segment' => $discount?->segment,
            ...MeterReading::chargesFor($consumption, $unitPrice, $minimumPayment, $discount?->method, $discount?->value),
            'status' => MeterReadingStatus::Pending,
            'recorded_by' => $request->user()->id,
            'notes' => $request->input('notes'),
        ]);

        $request->user()->notify(new ActionCompleted('meter-reading-created', $subscriber->displayName()));

        return back()->with('status', 'meter-reading-created');
    }

    /**
     * Correct a reading, recalculating its charges from the price and
     * minimum captured when it was first recorded. Correcting an approved
     * reading sends it back for approval and tells the people who approve —
     * unless the corrector may approve it and asks to (`approve`, as the
     * statement's form does), when it is approved again at once and billed
     * at the corrected amount, all or nothing.
     */
    public function update(UpdateMeterReadingRequest $request, MeterReading $meterReading): RedirectResponse
    {
        $actor = $request->user();
        [$wentBackToReview, $approvedAgain] = DB::transaction(function () use ($request, $meterReading, $actor): array {
            $wentBackToReview = $meterReading->correct(
                $request->float('current_reading'),
                $request->has('notes') ? $request->input('notes') : $meterReading->notes,
                $actor,
            );
            $approvedAgain = $wentBackToReview && $request->boolean('approve') && $actor->can('approve', $meterReading);

            if ($approvedAgain) {
                $meterReading->approve($actor);
            }

            return [$wentBackToReview, $approvedAgain];
        });

        $actor->notify(new ActionCompleted('meter-reading-updated', $meterReading->subscriber->displayName()));

        if ($approvedAgain) {
            return back()->with('status', 'meter-reading-corrected-approved');
        }

        if (! $wentBackToReview) {
            return back()->with('status', 'meter-reading-updated');
        }

        Notification::send(
            $meterReading->approvers()->reject(fn (User $approver) => $approver->is($actor)),
            new ReadingNeedsReapproval($meterReading->subscriber->displayName(), $actor->name),
        );

        return back()->with('status', 'meter-reading-reopened');
    }

    /**
     * Approve the ticked readings, or `all` pending readings of the given
     * week among the subscribers matching the sheet's search and filters.
     * Approving locks a reading and charges it to the subscriber's
     * transactions; readings the actor may not approve, or that are no
     * longer pending, are skipped.
     */
    public function approve(ApproveMeterReadingsRequest $request): RedirectResponse
    {
        $actor = $request->user();
        $query = $request->boolean('all')
            ? $this->pendingInSheet($request, $actor, MeterReading::weekStartFor($request->date('week'))->toDateString())
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
     * How many of the week's readings on the sheet (search and filters
     * applied) still wait for approval, and what they add up to.
     *
     * @return array{count: int, amountDue: string}
     */
    private function pendingApprovalSummary(Request $request, User $actor, string $week): array
    {
        $pending = $this->pendingInSheet($request, $actor, $week);

        return [
            'count' => (clone $pending)->count(),
            'amountDue' => number_format((float) $pending->sum('amount_due'), 2, '.', ''),
        ];
    }

    /**
     * Pending readings in the actor's branch (every branch for the Super Admin).
     *
     * @return Builder<MeterReading>
     */
    private function pendingReadings(User $actor): Builder
    {
        return MeterReading::query()
            ->visibleTo($actor)
            ->where('status', MeterReadingStatus::Pending);
    }

    /**
     * The week's pending readings for the subscribers the sheet shows with
     * the request's search and filters.
     *
     * @return Builder<MeterReading>
     */
    private function pendingInSheet(Request $request, User $actor, string $week): Builder
    {
        $subscribers = $this->subscribersInScope($actor);
        $this->applyDataTableFilters($subscribers, $request, ['full_name', 'subscription_name', 'account_number', 'phone', 'subscription_phone'], [], 'full_name');
        $this->applyDataTableFilterSelects($subscribers, $request, ['branch_id', 'meter_box_id', 'tariff_id']);
        $this->applyMeterBoxNameFilter($subscribers, $request);
        $this->applySheetFilters($subscribers, $request, $week);

        return $this->pendingReadings($actor)
            ->whereDate('week_start', $week)
            ->whereIn('subscriber_id', $subscribers->reorder()->select('subscribers.id'));
    }

    /**
     * Whether the company-wide reading entry window is open, and whether it
     * restricts this actor at all: only people who enter readings are held to
     * it, and the Super Admin may enter them any time.
     *
     * @return array{isOpen: bool, appliesToActor: bool, openDays: array<int, int>, opensAt: string, closesAt: string}
     */
    private function entryWindow(User $actor): array
    {
        $setting = ReadingEntrySetting::current();

        return [
            'isOpen' => $setting->isOpen(),
            'appliesToActor' => ! $actor->isSuperAdmin() && $actor->hasPermission(PermissionKey::RecordMeterReadings),
            'openDays' => $setting->mode === ReadingEntryMode::Automatic ? array_map('intval', $setting->open_days) : [],
            'opensAt' => substr($setting->opens_at, 0, 5),
            'closesAt' => substr($setting->closes_at, 0, 5),
        ];
    }

    /**
     * Active subscribers the actor may see readings for.
     *
     * @return Builder<Subscriber>
     */
    private function subscribersInScope(User $actor): Builder
    {
        return Subscriber::query()
            ->visibleTo($actor)
            ->where('status', SubscriberStatus::Active);
    }

    /**
     * Add each row's reading values for the week as selectable (and so
     * sortable) columns: the meter box number, the last reading the week
     * starts from, and — once entered — the new reading, consumption and
     * amount to pay.
     */
    private function withSheetColumns(Builder $query, string $week): void
    {
        $thisWeek = fn (string $column) => MeterReading::query()
            ->select($column)
            ->whereColumn('meter_readings.subscriber_id', 'subscribers.id')
            ->whereDate('week_start', $week)
            ->limit(1);

        $lastBefore = MeterReading::query()
            ->select('current_reading')
            ->whereColumn('meter_readings.subscriber_id', 'subscribers.id')
            ->whereDate('week_start', '<', $week)
            ->orderByDesc('week_start')
            ->limit(1);

        $thisWeekPrevious = $thisWeek('previous_reading');

        $query->select('subscribers.*')
            ->selectSub(MeterBox::query()->select('box_number')->whereColumn('meter_boxes.id', 'subscribers.meter_box_id'), 'meter_box_number')
            ->selectSub(MeterBox::query()->select('name')->whereColumn('meter_boxes.id', 'subscribers.meter_box_id'), 'meter_box_name')
            ->selectSub(MeterBox::query()->select('name_suffix')->whereColumn('meter_boxes.id', 'subscribers.meter_box_id'), 'meter_box_suffix')
            ->selectRaw(
                "COALESCE(({$thisWeekPrevious->toSql()}), ({$lastBefore->toSql()}), subscribers.initial_reading, 0) as last_reading",
                [...$thisWeekPrevious->getBindings(), ...$lastBefore->getBindings()],
            )
            ->selectSub($thisWeek('current_reading'), 'current_reading')
            ->selectSub($thisWeek('consumption'), 'consumption')
            ->selectSub($thisWeek('amount_due'), 'amount_due');
    }

    /**
     * `?sort=meter_box`: by meter box — its name, then its suffix, then its
     * number, numbers in numeric order (BOX-9 before BOX-10) — with
     * subscribers without a box last. Applied before the table's own sort,
     * which then only breaks ties (by name).
     */
    private function applyMeterBoxSort(Builder $query, Request $request): void
    {
        if ((string) $request->string('sort') !== 'meter_box') {
            return;
        }

        $direction = $request->string('direction')->lower()->value() === 'desc' ? 'desc' : 'asc';

        $query->orderByRaw('meter_box_name IS NULL')
            ->orderBy('meter_box_name', $direction)
            ->orderByRaw('LENGTH(COALESCE(meter_box_suffix, \'\')) '.$direction)
            ->orderBy('meter_box_suffix', $direction)
            ->orderByRaw('LENGTH(meter_box_number) '.$direction)
            ->orderBy('meter_box_number', $direction);
    }

    /**
     * The requested week (any date is snapped to the first day of its
     * week), defaulting to the latest week that has ended and never later
     * than it.
     */
    private function selectedWeek(Request $request): Carbon
    {
        $latestWeek = MeterReading::latestEndedWeekStart();
        $requested = $request->date('week');

        if ($requested === null) {
            return $latestWeek;
        }

        return MeterReading::weekStartFor($requested)->min($latestWeek);
    }

    /**
     * Filters that need a join rather than a plain column match: the
     * area/sub-area a subscriber's meter box sits in, whether this week's
     * reading has been entered yet, and whether it has been approved.
     */
    private function applySheetFilters(Builder $query, Request $request, string $week, bool $includeStatus = true): void
    {
        $filters = (array) $request->input('filter', []);

        if (filled($filters['area_id'] ?? null)) {
            $query->whereHas('branch', fn (Builder $q) => $q->where('area_id', $filters['area_id']));
        }

        if (filled($filters['sub_area_id'] ?? null)) {
            $query->whereHas('meterBox', fn (Builder $q) => $q->where('sub_area_id', $filters['sub_area_id']));
        }

        $this->applyCircuitBreakerFilter($query, $request);

        if ($includeStatus) {
            $this->applySheetStatusFilters($query, $request, $week);
        }
    }

    private function applySheetStatusFilters(Builder $query, Request $request, string $week): void
    {
        $filters = (array) $request->input('filter', []);

        match ($filters['entry'] ?? null) {
            'entered' => $query->whereHas('meterReadings', fn (Builder $q) => $q->whereDate('week_start', $week)),
            'missing' => $query->whereDoesntHave('meterReadings', fn (Builder $q) => $q->whereDate('week_start', $week)),
            default => null,
        };

        $approval = MeterReadingStatus::tryFrom((string) ($filters['approval'] ?? ''));

        if ($approval !== null) {
            $query->whereHas('meterReadings', fn (Builder $q) => $q->whereDate('week_start', $week)->where('status', $approval));
        }
    }

    /**
     * Counts for the status tabs retain search and location filters, without
     * narrowing the other tabs to the currently selected status or page.
     *
     * @return array{total: int, pending: int, approved: int, missing: int}
     */
    private function statusSummary(Builder $query, string $week): array
    {
        $counts = MeterReading::query()
            ->whereIn('subscriber_id', (clone $query)->reorder()->select('subscribers.id'))
            ->whereDate('week_start', $week)
            ->selectRaw('status, COUNT(*) as reading_count')
            ->groupBy('status')
            ->toBase()->pluck('reading_count', 'status');
        $total = (clone $query)->count();
        $pending = (int) ($counts[MeterReadingStatus::Pending->value] ?? 0);
        $approved = (int) ($counts[MeterReadingStatus::Approved->value] ?? 0);

        return ['total' => $total, 'pending' => $pending, 'approved' => $approved, 'missing' => $total - $pending - $approved];
    }

    /**
     * One sheet row. A reading already entered for the week shows the
     * prices and standing discount captured with it; otherwise the
     * subscriber's current price, minimum and discount are shown for the
     * live calculation.
     *
     * @return array<string, mixed>
     */
    private function sheetRow(Subscriber $subscriber, Carbon $weekStart, User $actor): array
    {
        $reading = $subscriber->meterReadings->first(fn (MeterReading $r) => $r->week_start->equalTo($weekStart));
        $lastBefore = $subscriber->meterReadings->first(fn (MeterReading $r) => $r->week_start->lessThan($weekStart));
        [$discountMethod, $discountValue, $discountSegment] = $reading
            ? [$reading->discount_method, $reading->discount_value, $reading->discount_segment]
            : [$subscriber->standingDiscount?->method, $subscriber->standingDiscount?->value, $subscriber->standingDiscount?->segment];

        return [
            'id' => $subscriber->id,
            'accountNumber' => $subscriber->account_number,
            'fullName' => $subscriber->displayName(),
            'meterBoxNumber' => $subscriber->meterBox?->box_number,
            'meterBoxName' => $subscriber->meterBox?->displayName(),
            'phone' => $subscriber->contactPhone(),
            'subAreaName' => $subscriber->meterBox?->subArea?->name,
            'previousReading' => $reading?->previous_reading ?? (float) ($lastBefore?->current_reading ?? $subscriber->initial_reading ?? 0),
            'unitPrice' => (string) ($reading?->unit_price ?? $subscriber->tariff->rate),
            'minimumPayment' => (string) ($reading?->minimum_payment ?? $subscriber->weeklyMinimumPayment()),
            'discount' => $discountMethod ? [
                'method' => $discountMethod->value,
                'value' => $discountValue,
                'terms' => StandingDiscount::termsFor($discountMethod, $discountValue),
                'segment' => $discountSegment,
            ] : null,
            'reading' => $reading ? [
                'id' => $reading->id,
                'currentReading' => $reading->current_reading,
                'consumption' => $reading->consumption,
                'readingFee' => $reading->reading_fee,
                'discountAmount' => $reading->discount_amount,
                'amountDue' => $reading->amount_due,
                'status' => $reading->status->value,
                'statusLabel' => __($reading->status->label()),
                'recordedByName' => $reading->recordedBy?->name,
                'recordedAt' => $reading->created_at?->timezone(config('app.business_timezone'))->format('d/m H:i'),
                'recordedSource' => $reading->mobile_operation_id !== null ? 'app' : 'web',
                'approvedByName' => $reading->approvedBy?->name,
                'approvedAt' => $reading->approved_at?->timezone(config('app.business_timezone'))->format('d/m H:i'),
            ] : null,
            'hasLaterWeek' => (bool) $subscriber->has_later_week,
            'canApprove' => $reading !== null && $actor->can('approve', $reading),
            'canEdit' => $reading
                ? ! $subscriber->has_later_week && $actor->can('update', $reading)
                : ! $subscriber->has_later_week && $actor->can('create', [MeterReading::class, $weekStart]),
        ];
    }

    /**
     * The Filter menu's dropdown groups.
     *
     * @return array<int, array{key: string, label: string, options: array<int, array{value: string, label: string}>}>
     */
    private function filterOptions(User $actor): array
    {
        $groups = [];

        if ($actor->isSuperAdmin()) {
            $groups[] = $this->branchFilterGroup();
            $groups[] = $this->areaFilterGroup(Area::orderBy('name')->get());
        }

        $groups[] = $this->subAreaFilterGroup(SubArea::visibleTo($actor)->orderBy('name')->get());

        array_push($groups, ...$this->meterBoxFilterGroups(MeterBox::query()->visibleTo($actor)->with('subArea')->get()));
        $groups[] = $this->circuitBreakerFilterGroup();

        $groups[] = $this->filterGroup('tariff_id', 'نوع الاشتراك', $this->modelOptions(
            Tariff::orderBy('id')->get(),
            'name',
        ));

        $groups[] = $this->filterGroup('entry', 'حالة الإدخال', [
            ['value' => 'missing', 'label' => 'لم تُدخل بعد'],
            ['value' => 'entered', 'label' => 'تم الإدخال'],
        ]);

        $groups[] = $this->filterGroup('approval', 'حالة الاعتماد', [
            ['value' => MeterReadingStatus::Pending->value, 'label' => 'بانتظار الاعتماد'],
            ['value' => MeterReadingStatus::Approved->value, 'label' => 'معتمدة'],
        ]);

        return $groups;
    }
}
