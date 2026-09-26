<?php

namespace App\Http\Controllers;

use App\Http\Concerns\BuildsDailySeries;
use App\Http\Concerns\FiltersDataTable;
use App\Models\Branch;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

/**
 * The financial log: every ledger entry of the subscribers the user may
 * see, newest first, with the period's totals, a daily chart and a
 * per-branch breakdown. Read-only — entries are written elsewhere.
 */
class FinancialLogController extends Controller
{
    use BuildsDailySeries, FiltersDataTable;

    /**
     * The period tabs, as the number of days they cover (null: all time).
     */
    private const PERIODS = ['today' => 1, '7' => 7, '30' => 30, '90' => 90, 'all' => null];

    private const DEFAULT_PERIOD = '30';

    private const SORTABLE = ['created_at', 'amount'];

    /**
     * How many days the chart shows when the period is shorter (today) or
     * unbounded (all time).
     */
    private const MIN_CHART_DAYS = 7;

    private const UNBOUNDED_CHART_DAYS = 30;

    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', SubscriberTransaction::class);

        $actor = $request->user();
        $period = $this->period($request);
        $days = self::PERIODS[$period];
        $from = $days ? today()->subDays($days - 1) : null;

        $inPeriod = fn () => $this->filteredLedger($request, $actor)
            ->when($from, fn (Builder $query) => $query->where('subscriber_transactions.created_at', '>=', $from));

        $entries = $inPeriod()->with(['subscriber.branch', 'recordedBy']);
        $this->applyDataTableFilters($entries, $request, [], self::SORTABLE, 'created_at', 'desc');
        $entries = $entries->orderByDesc('id')
            ->paginate($this->dataTablePerPage($request, 25))
            ->withQueryString()
            ->through(fn (SubscriberTransaction $transaction) => $this->row($transaction));

        $chartDays = $days === null ? self::UNBOUNDED_CHART_DAYS : max($days, self::MIN_CHART_DAYS);

        return Inertia::render('FinancialLog/Index', [
            'entries' => $entries,
            'period' => $period,
            'summary' => $this->summary($inPeriod(), $from ? $this->filteredLedger($request, $actor) : null, $from, $days),
            'dayTotals' => $this->dayTotals($inPeriod()->charges(), collect($entries->items())->pluck('day')->unique()->values()->all()),
            'dailyTotals' => $this->dailySeries($this->filteredLedger($request, $actor)->charges(), 'subscriber_transactions.created_at', 'sum(subscriber_transactions.amount)', $chartDays),
            'branchTotals' => $this->branchTotals($inPeriod()->charges()),
            'scopeLabel' => $this->scopeLabel($request, $actor),
            'filters' => $this->dataTableState($request, 'created_at', 'desc', 25),
            'filterOptions' => $this->filterOptions($actor),
        ]);
    }

    /**
     * The ledger the user may see — entries of subscribers in their own
     * branch (every branch for the Super Admin) — narrowed by the search
     * box and the Filter menu. Unordered, so it can be aggregated.
     *
     * @return Builder<SubscriberTransaction>
     */
    private function filteredLedger(Request $request, User $actor): Builder
    {
        $search = $this->searchTerm($request);
        $branchId = $this->branchFilter($request, $actor);

        $query = SubscriberTransaction::query()->whereHas('subscriber', fn (Builder $subscribers) => $subscribers
            ->visibleTo($actor)
            ->when($branchId, fn (Builder $query) => $query->where('branch_id', $branchId))
            ->when($search !== '', fn (Builder $query) => $query->where(fn (Builder $inner) => $inner
                ->where('full_name', 'like', "%{$search}%")
                ->orWhere('phone', 'like', "%{$search}%")
                ->orWhere('account_number', 'like', "%{$search}%"))));

        return $this->applyDataTableFilterSelects($query, $request, ['type', 'recorded_by']);
    }

    /**
     * The period's charges — total, count, average and largest — against
     * the same number of days just before it, and what was paid in the
     * period. Payments are stored as negative amounts, so they are totalled
     * apart instead of cancelling the charges out.
     *
     * @param  Builder<SubscriberTransaction>  $inPeriod
     * @param  Builder<SubscriberTransaction>|null  $ledger
     * @return array{total: float, count: int, average: float, largest: float, previousTotal: float|null, changePct: int|null, paid: float}
     */
    private function summary(Builder $inPeriod, ?Builder $ledger, ?Carbon $from, ?int $days): array
    {
        $paid = -(float) (clone $inPeriod)->where('type', SubscriberTransaction::TYPE_PAYMENT)->sum('amount');
        $totals = $inPeriod->charges()->selectRaw('count(*) as entries, coalesce(sum(amount), 0) as total, coalesce(max(amount), 0) as largest')->first();
        $total = (float) $totals->total;
        $count = (int) $totals->entries;

        $previousTotal = $ledger && $from && $days
            ? (float) $ledger
                ->charges()
                ->where('subscriber_transactions.created_at', '>=', $from->copy()->subDays($days))
                ->where('subscriber_transactions.created_at', '<', $from)
                ->sum('amount')
            : null;

        return [
            'total' => round($total, 2),
            'count' => $count,
            'average' => $count > 0 ? round($total / $count, 2) : 0.0,
            'largest' => round((float) $totals->largest, 2),
            'previousTotal' => $previousTotal,
            'changePct' => $previousTotal ? (int) round(($total - $previousTotal) / $previousTotal * 100) : null,
            'paid' => round($paid, 2),
        ];
    }

    /**
     * Each listed day's full total and entry count, so a day that runs over
     * two pages still shows its whole figure.
     *
     * @param  Builder<SubscriberTransaction>  $inPeriod
     * @param  array<int, string>  $days
     * @return array<string, array{total: float, count: int}>
     */
    private function dayTotals(Builder $inPeriod, array $days): array
    {
        if ($days === []) {
            return [];
        }

        return $inPeriod
            ->whereIn(DB::raw('date(subscriber_transactions.created_at)'), $days)
            ->selectRaw('date(subscriber_transactions.created_at) as day, sum(amount) as total, count(*) as entries')
            ->groupBy('day')
            ->get()
            ->mapWithKeys(fn ($day) => [$day->day => ['total' => round((float) $day->total, 2), 'count' => (int) $day->entries]])
            ->all();
    }

    /**
     * The period's total and entry count per branch, largest first.
     *
     * @param  Builder<SubscriberTransaction>  $inPeriod
     * @return array<int, array{id: int, name: string, total: float, count: int}>
     */
    private function branchTotals(Builder $inPeriod): array
    {
        $totals = $inPeriod
            ->join('subscribers', 'subscribers.id', '=', 'subscriber_transactions.subscriber_id')
            ->selectRaw('subscribers.branch_id, sum(subscriber_transactions.amount) as total, count(*) as entries')
            ->groupBy('subscribers.branch_id')
            ->get();

        $names = Branch::whereIn('id', $totals->pluck('branch_id'))->pluck('name', 'id');

        return $totals
            ->map(fn ($branch) => [
                'id' => (int) $branch->branch_id,
                'name' => $names[$branch->branch_id] ?? '—',
                'total' => round((float) $branch->total, 2),
                'count' => (int) $branch->entries,
            ])
            ->sortByDesc('total')
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function row(SubscriberTransaction $transaction): array
    {
        return [
            'id' => $transaction->id,
            'day' => $transaction->created_at->toDateString(),
            'time' => $transaction->created_at->format('H:i'),
            'subscriberName' => $transaction->subscriber->full_name,
            'subscriberPhone' => $transaction->subscriber->phone,
            'subscriberStatus' => $transaction->subscriber->status->value,
            'branchName' => $transaction->subscriber->branch->name,
            'type' => $transaction->type,
            'typeLabel' => $transaction->kindLabel(),
            'isPayment' => $transaction->isPayment(),
            'recordedByName' => $transaction->recordedBy?->name,
            'amount' => $transaction->amount,
        ];
    }

    /**
     * What the log covers, shown above its title.
     */
    private function scopeLabel(Request $request, User $actor): string
    {
        if (! $actor->isSuperAdmin()) {
            return $actor->branch?->name ?? '—';
        }

        $branchId = $this->branchFilter($request, $actor);

        return $branchId ? (Branch::find($branchId)?->name ?? 'كل الفروع') : 'كل الفروع';
    }

    /**
     * The Filter menu: branch (Super Admin only), entry type and who
     * recorded it.
     *
     * @return array<int, array{key: string, label: string, options: array<int, array{value: string, label: string}>}>
     */
    private function filterOptions(User $actor): array
    {
        $groups = [];

        if ($actor->isSuperAdmin()) {
            $groups[] = $this->branchFilterGroup();
        }

        $groups[] = $this->filterGroup('type', 'نوع القيد', collect([
            SubscriberTransaction::TYPE_SUBSCRIPTION_FEE,
            SubscriberTransaction::TYPE_METER_READING,
            SubscriberTransaction::TYPE_PAYMENT,
        ])->map(fn (string $type) => ['value' => $type, 'label' => (new SubscriberTransaction(['type' => $type]))->kindLabel()]));

        $groups[] = $this->filterGroup('recorded_by', 'سجّله', $this->modelOptions(
            User::query()->visibleTo($actor)->whereIn('id', SubscriberTransaction::query()->select('recorded_by'))->orderBy('name')->get(),
        ));

        return $groups;
    }

    /**
     * The branch picked in the Filter menu — only the Super Admin has one to
     * pick; everyone else's log is always their own branch.
     */
    private function branchFilter(Request $request, User $actor): ?string
    {
        return $actor->isSuperAdmin() ? ($this->queryText($request, 'filter.branch_id') ?: null) : null;
    }

    private function period(Request $request): string
    {
        $period = $this->queryText($request, 'period');

        return array_key_exists($period, self::PERIODS) ? $period : self::DEFAULT_PERIOD;
    }
}
