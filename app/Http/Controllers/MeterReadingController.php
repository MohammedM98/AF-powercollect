<?php

namespace App\Http\Controllers;

use App\Enums\MeterReadingStatus;
use App\Enums\ReadingEntryMode;
use App\Enums\SubscriberStatus;
use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\StoreMeterReadingRequest;
use App\Http\Requests\UpdateMeterReadingRequest;
use App\Models\Area;
use App\Models\Branch;
use App\Models\MeterBox;
use App\Models\MeterReading;
use App\Models\ReadingEntrySetting;
use App\Models\SubArea;
use App\Models\Subscriber;
use App\Models\Tariff;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
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
                'meterBox.subArea',
                'meterReadings' => fn ($q) => $q->whereDate('week_start', '<=', $week)->orderByDesc('week_start'),
            ])
            ->withExists(['meterReadings as has_later_week' => fn ($q) => $q->whereDate('week_start', '>', $week)]);

        $this->withSheetColumns($query, $week);
        $this->applyDataTableFilters($query, $request, ['full_name', 'account_number', 'phone'], self::SORTABLE, 'full_name');
        $query->orderBy('subscribers.id');
        $this->applyDataTableFilterSelects($query, $request, ['branch_id', 'meter_box_id', 'tariff_id']);
        $this->applySheetFilters($query, $request, $week);

        $enteredThisWeek = fn (Builder $q) => $q->whereDate('week_start', $week);

        $rows = $query->paginate($this->dataTablePerPage($request, 25))
            ->withQueryString()
            ->through(fn (Subscriber $subscriber) => $this->sheetRow($subscriber, $weekStart, $actor));

        $scope = $this->subscribersInScope($actor);

        return Inertia::render('MeterReadings/Index', [
            'rows' => $rows,
            'week' => $week,
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
            'entryWindow' => $this->entryWindow($actor),
            'status' => session('status'),
            'filters' => $this->dataTableState($request, 'full_name', 'asc', 25),
            'filterOptions' => $this->filterOptions($actor),
        ]);
    }

    /**
     * Store a newly created resource in storage. The reading records the
     * meter and what the week costs, but does not charge the subscriber's
     * balance.
     */
    public function store(StoreMeterReadingRequest $request): RedirectResponse
    {
        $subscriber = Subscriber::with(['tariff', 'circuitBreaker'])->findOrFail($request->integer('subscriber_id'));
        $weekStart = $request->weekStart();
        $previousReading = $subscriber->previousReadingBefore($weekStart);
        $currentReading = $request->integer('current_reading');
        $consumption = $currentReading - $previousReading;
        $unitPrice = (string) $subscriber->tariff->rate;
        $minimumPayment = $subscriber->weeklyMinimumPayment();

        MeterReading::create([
            'subscriber_id' => $subscriber->id,
            'branch_id' => $subscriber->branch_id,
            'week_start' => $weekStart,
            'week_end' => $weekStart->copy()->addDays(6),
            'previous_reading' => $previousReading,
            'current_reading' => $currentReading,
            'consumption' => $consumption,
            'unit_price' => $unitPrice,
            'minimum_payment' => $minimumPayment,
            ...MeterReading::chargesFor($consumption, $unitPrice, $minimumPayment),
            'status' => MeterReadingStatus::Pending,
            'recorded_by' => $request->user()->id,
            'notes' => $request->input('notes'),
        ]);

        return back()->with('status', 'meter-reading-created');
    }

    /**
     * Update the specified resource in storage, recalculating its charges
     * from the price and minimum captured when it was first recorded.
     */
    public function update(UpdateMeterReadingRequest $request, MeterReading $meterReading): RedirectResponse
    {
        $currentReading = $request->integer('current_reading');
        $consumption = $currentReading - $meterReading->previous_reading;

        $meterReading->update([
            'current_reading' => $currentReading,
            'consumption' => $consumption,
            ...MeterReading::chargesFor($consumption, $meterReading->unit_price, $meterReading->minimum_payment),
            'notes' => $request->has('notes') ? $request->input('notes') : $meterReading->notes,
        ]);

        return back()->with('status', 'meter-reading-updated');
    }

    /**
     * Whether the company-wide reading entry window is open, and whether it
     * restricts this actor at all (admins may enter readings any time).
     *
     * @return array{isOpen: bool, appliesToActor: bool, openDays: array<int, int>}
     */
    private function entryWindow(User $actor): array
    {
        $setting = ReadingEntrySetting::current();

        return [
            'isOpen' => $setting->isOpen(),
            'appliesToActor' => ! $actor->isSuperAdmin() && ! $actor->isBranchAdmin(),
            'openDays' => $setting->mode === ReadingEntryMode::Automatic ? array_map('intval', $setting->open_days) : [],
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
            ->where('status', SubscriberStatus::Active)
            ->when(! $actor->isSuperAdmin(), fn (Builder $q) => $q->where('branch_id', $actor->branch_id));
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
            ->selectRaw(
                "COALESCE(({$thisWeekPrevious->toSql()}), ({$lastBefore->toSql()}), subscribers.initial_reading, 0) as last_reading",
                [...$thisWeekPrevious->getBindings(), ...$lastBefore->getBindings()],
            )
            ->selectSub($thisWeek('current_reading'), 'current_reading')
            ->selectSub($thisWeek('consumption'), 'consumption')
            ->selectSub($thisWeek('amount_due'), 'amount_due');
    }

    /**
     * The requested week (any date is snapped to its Friday), defaulting
     * to the current week and never later than it.
     */
    private function selectedWeek(Request $request): Carbon
    {
        $currentWeek = MeterReading::weekStartFor(now());
        $requested = $request->date('week');

        if ($requested === null) {
            return $currentWeek;
        }

        return MeterReading::weekStartFor($requested)->min($currentWeek);
    }

    /**
     * Filters that need a join rather than a plain column match: the
     * area/sub-area a subscriber's meter box sits in, and whether this
     * week's reading has been entered yet.
     */
    private function applySheetFilters(Builder $query, Request $request, string $week): void
    {
        $filters = (array) $request->input('filter', []);

        if (filled($filters['area_id'] ?? null)) {
            $query->whereHas('branch', fn (Builder $q) => $q->where('area_id', $filters['area_id']));
        }

        if (filled($filters['sub_area_id'] ?? null)) {
            $query->whereHas('meterBox', fn (Builder $q) => $q->where('sub_area_id', $filters['sub_area_id']));
        }

        match ($filters['entry'] ?? null) {
            'entered' => $query->whereHas('meterReadings', fn (Builder $q) => $q->whereDate('week_start', $week)),
            'missing' => $query->whereDoesntHave('meterReadings', fn (Builder $q) => $q->whereDate('week_start', $week)),
            default => null,
        };
    }

    /**
     * One sheet row. A reading already entered for the week shows the
     * prices captured with it; otherwise the subscriber's current price
     * and minimum are shown for the live calculation.
     *
     * @return array<string, mixed>
     */
    private function sheetRow(Subscriber $subscriber, Carbon $weekStart, User $actor): array
    {
        $reading = $subscriber->meterReadings->first(fn (MeterReading $r) => $r->week_start->equalTo($weekStart));
        $lastBefore = $subscriber->meterReadings->first(fn (MeterReading $r) => $r->week_start->lessThan($weekStart));

        return [
            'id' => $subscriber->id,
            'accountNumber' => $subscriber->account_number,
            'fullName' => $subscriber->full_name,
            'meterBoxNumber' => $subscriber->meterBox?->box_number,
            'subAreaName' => $subscriber->meterBox?->subArea?->name,
            'previousReading' => $reading?->previous_reading ?? (int) ($lastBefore?->current_reading ?? $subscriber->initial_reading ?? 0),
            'unitPrice' => (string) ($reading?->unit_price ?? $subscriber->tariff->rate),
            'minimumPayment' => (string) ($reading?->minimum_payment ?? $subscriber->weeklyMinimumPayment()),
            'reading' => $reading ? [
                'id' => $reading->id,
                'currentReading' => $reading->current_reading,
                'consumption' => $reading->consumption,
                'readingFee' => $reading->reading_fee,
                'amountDue' => $reading->amount_due,
                'status' => $reading->status->value,
                'statusLabel' => __($reading->status->label()),
            ] : null,
            'hasLaterWeek' => (bool) $subscriber->has_later_week,
            'canEdit' => $reading
                ? ! $subscriber->has_later_week && $actor->can('update', $reading)
                : ! $subscriber->has_later_week && $actor->can('create', MeterReading::class),
        ];
    }

    /**
     * The Filter menu's dropdown groups.
     *
     * @return array<int, array{key: string, label: string, options: array<int, array{value: string, label: string}>}>
     */
    private function filterOptions(User $actor): array
    {
        $option = fn (string|int $value, string $label) => ['value' => (string) $value, 'label' => $label];
        $groups = [];

        if ($actor->isSuperAdmin()) {
            $groups[] = [
                'key' => 'branch_id',
                'label' => 'الفرع',
                'options' => Branch::orderBy('name')->get()->map(fn (Branch $branch) => $option($branch->id, $branch->name))->all(),
            ];
            $groups[] = [
                'key' => 'area_id',
                'label' => 'المنطقة',
                'options' => Area::orderBy('name')->get()->map(fn (Area $area) => $option($area->id, $area->name))->all(),
            ];
        }

        $groups[] = [
            'key' => 'sub_area_id',
            'label' => 'منطقة 2',
            'options' => SubArea::query()
                ->when(! $actor->isSuperAdmin(), fn (Builder $q) => $q->where('area_id', $actor->branch?->area_id))
                ->orderBy('name')
                ->get()
                ->map(fn (SubArea $subArea) => $option($subArea->id, $subArea->name))
                ->all(),
        ];

        $groups[] = [
            'key' => 'meter_box_id',
            'label' => 'الطبلون',
            'options' => MeterBox::query()
                ->when(! $actor->isSuperAdmin(), fn (Builder $q) => $q->where('branch_id', $actor->branch_id))
                ->orderBy('box_number')
                ->get()
                ->map(fn (MeterBox $box) => $option($box->id, $box->name ? "{$box->box_number} — {$box->name}" : $box->box_number))
                ->all(),
        ];

        $groups[] = [
            'key' => 'tariff_id',
            'label' => 'نوع الاشتراك',
            'options' => Tariff::orderBy('category')->get()->map(fn (Tariff $tariff) => $option($tariff->id, __($tariff->category->label())))->all(),
        ];

        $groups[] = [
            'key' => 'entry',
            'label' => 'حالة الإدخال',
            'options' => [$option('missing', 'لم تُدخل بعد'), $option('entered', 'تم الإدخال')],
        ];

        return $groups;
    }
}
