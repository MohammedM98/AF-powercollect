<?php

namespace App\Http\Controllers;

use App\Http\Concerns\BuildsSubscriberStatement;
use App\Http\Concerns\FiltersDataTable;
use App\Models\Branch;
use App\Models\SubscriberTransaction;
use App\Models\User;
use App\Support\DailySeries;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

/**
 * The financial log (السجل المالي): every line of the accounts of the
 * subscribers the user may see, newest first and grouped by day, with the
 * period's totals, a daily chart and the totals per branch. Read-only.
 *
 * The figures sum one side of the accounts: the charges (عليه) unless the
 * type filter picks payments or discounts (له), since adding money owed to
 * money paid would mean nothing. Amounts are in shekels. Cancelled lines
 * and their reversals are listed but left out of every figure, since they
 * cancel each other out.
 */
class LedgerController extends Controller
{
    use BuildsSubscriberStatement, FiltersDataTable;

    /**
     * The period tabs, as the number of days each covers (null: since the
     * first entry).
     */
    private const PERIODS = ['today' => 1, '7' => 7, '30' => 30, '90' => 90, 'all' => null];

    private const DEFAULT_PERIOD = '30';

    private const DEFAULT_PER_PAGE = 25;

    /**
     * The chart never shows fewer days than this, and shows this many when
     * the period has no start.
     */
    private const MIN_CHART_DAYS = 7;

    private const OPEN_CHART_DAYS = 30;

    /**
     * Type-filter values that pick a whole side instead of one type.
     */
    private const DEBIT = 'debit';

    private const CREDIT = 'credit';

    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', SubscriberTransaction::class);

        $actor = $request->user();
        $period = $this->period($request);
        $days = self::PERIODS[$period];
        $from = $days ? DailySeries::startOfDay($days - 1) : null;
        $side = $this->headlineSide($request);

        $ledger = fn (): Builder => $this->filteredLedger($request, $actor);
        $inPeriod = fn (): Builder => $ledger()->when($from, fn (Builder $query) => $query->where('subscriber_transactions.created_at', '>=', $from));
        $onSide = fn (Builder $query): Builder => $side === self::CREDIT ? $query->credits() : $query->charges();

        $entries = $this->sortEntries($inPeriod()->with(['subscriber.branch', 'recordedBy']), $request)
            ->paginate($this->dataTablePerPage($request, self::DEFAULT_PER_PAGE))
            ->withQueryString()
            ->through(fn (SubscriberTransaction $transaction): array => $this->row($transaction));

        $groupedByDay = ! $this->sortedByAmount($request);

        return Inertia::render('Ledger/Index', [
            'entries' => $entries,
            'period' => $period,
            'side' => $side,
            'summary' => $this->summary($onSide($inPeriod()), $from && $days ? $onSide($ledger()) : null, $from, $days, $inPeriod()),
            'dayTotals' => $groupedByDay ? $this->dayTotals($inPeriod(), collect($entries->items())->pluck('day')->unique()->all()) : [],
            'dailyTotals' => DailySeries::sums(
                $onSide($ledger()),
                'subscriber_transactions.created_at',
                'subscriber_transactions.amount',
                $days === null ? self::OPEN_CHART_DAYS : max($days, self::MIN_CHART_DAYS),
            ),
            'branchTotals' => $this->branchTotals($onSide($inPeriod())),
            'today' => DailySeries::today()->toDateString(),
            'scopeLabel' => $this->scopeLabel($request, $actor),
            'filters' => $this->dataTableState($request, 'created_at', 'desc', self::DEFAULT_PER_PAGE),
            'filterOptions' => $this->filterOptions($actor),
            // A line's subscriber's statement, opened over the log.
            'statement' => fn () => $this->requestedStatement($request, $actor),
        ]);
    }

    /**
     * The lines the user may see — of subscribers in their own branch (any
     * branch for the Super Admin) — narrowed by the search box and the
     * filters. Unordered, so it can be totalled.
     *
     * @return Builder<SubscriberTransaction>
     */
    private function filteredLedger(Request $request, User $actor): Builder
    {
        $search = $this->searchTerm($request);
        $branchId = $actor->isSuperAdmin() ? $this->filterValue($request, 'branch_id') : null;
        $type = $this->filterValue($request, 'type');
        $recordedBy = $this->filterValue($request, 'recorded_by');

        return SubscriberTransaction::query()
            ->whereHas('subscriber', fn (Builder $subscribers) => $subscribers
                ->visibleTo($actor)
                ->when($branchId, fn (Builder $query) => $query->where('branch_id', $branchId))
                ->when($search !== '', fn (Builder $query) => $query->where(fn (Builder $inner) => $inner
                    ->where('full_name', 'like', "%{$search}%")
                    ->orWhere('subscription_name', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('subscription_phone', 'like', "%{$search}%")
                    ->orWhere('account_number', 'like', "%{$search}%"))))
            ->when($type === self::DEBIT, fn (Builder $query) => $query->charges())
            ->when($type === self::CREDIT, fn (Builder $query) => $query->credits())
            ->when(array_key_exists((string) $type, SubscriberTransaction::typeLabels()), fn (Builder $query) => $query->where('type', $type))
            ->when($recordedBy, fn (Builder $query) => $query->where('recorded_by', $recordedBy));
    }

    /**
     * Newest first unless a column header asks otherwise; "amount" sorts by
     * the size of the line, whichever side it is on.
     *
     * @param  Builder<SubscriberTransaction>  $query
     * @return Builder<SubscriberTransaction>
     */
    private function sortEntries(Builder $query, Request $request): Builder
    {
        $direction = $request->input('sort') !== null && $request->string('direction')->lower()->value() === 'asc' ? 'asc' : 'desc';

        return ($this->sortedByAmount($request)
            ? $query->orderByRaw('abs(subscriber_transactions.amount) '.$direction)
            : $query->orderBy('subscriber_transactions.created_at', $direction))
            ->orderBy('subscriber_transactions.id', $direction);
    }

    private function sortedByAmount(Request $request): bool
    {
        return $request->input('sort') === 'amount';
    }

    /**
     * The headline figures for the period — total, count, average and
     * largest line — and the same total over as many days just before it.
     * `collected` is what was paid in the period, shown beside the charges.
     *
     * @param  Builder<SubscriberTransaction>  $headline  the period's lines on the headline side
     * @param  Builder<SubscriberTransaction>|null  $ledger  every line on that side, for the period before
     * @param  Builder<SubscriberTransaction>  $inPeriod  every line of the period, both sides
     * @return array{total: float, count: int, average: float, largest: float, previousTotal: float|null, changePct: int|null, collected: float}
     */
    private function summary(Builder $headline, ?Builder $ledger, ?CarbonImmutable $from, ?int $days, Builder $inPeriod): array
    {
        $totals = $headline->toBase()->selectRaw('count(*) as entries, coalesce(sum(abs(amount)), 0) as total, coalesce(max(abs(amount)), 0) as largest')->first();
        $total = round((float) $totals->total, 2);
        $count = (int) $totals->entries;

        $previousTotal = $ledger && $from && $days
            ? round((float) $ledger
                ->where('subscriber_transactions.created_at', '>=', $from->subDays($days))
                ->where('subscriber_transactions.created_at', '<', $from)
                ->toBase()
                ->selectRaw('coalesce(sum(abs(amount)), 0) as total')
                ->value('total'), 2)
            : null;

        return [
            'total' => $total,
            'count' => $count,
            'average' => $count > 0 ? round($total / $count, 2) : 0.0,
            'largest' => round((float) $totals->largest, 2),
            'previousTotal' => $previousTotal,
            'changePct' => $previousTotal ? (int) round(($total - $previousTotal) / $previousTotal * 100) : null,
            'collected' => round(-(float) $inPeriod->counted()->where('type', SubscriberTransaction::TYPE_PAYMENT)->sum('amount'), 2),
        ];
    }

    /**
     * Each listed day's full figures — however many of its lines this page
     * shows — for the headers that group the table by day: how many lines,
     * and the charges and the credits that day.
     *
     * @param  Builder<SubscriberTransaction>  $inPeriod
     * @param  array<int, string>  $days
     * @return array<string, array{count: int, charged: float, credited: float}>
     */
    private function dayTotals(Builder $inPeriod, array $days): array
    {
        if ($days === []) {
            return [];
        }

        $from = CarbonImmutable::parse(min($days), config('app.business_timezone'))->utc();
        $until = CarbonImmutable::parse(max($days), config('app.business_timezone'))->addDay()->utc();

        return $inPeriod
            ->counted()
            ->where('subscriber_transactions.created_at', '>=', $from)
            ->where('subscriber_transactions.created_at', '<', $until)
            ->toBase()
            ->get(['subscriber_transactions.created_at as moment', 'amount', 'type'])
            ->groupBy(fn (object $line): string => DailySeries::localDate($line->moment))
            ->only($days)
            ->map(fn ($lines): array => [
                'count' => $lines->count(),
                'charged' => round($lines->reject(fn (object $line): bool => in_array($line->type, SubscriberTransaction::CREDIT_TYPES, true))->sum('amount'), 2),
                'credited' => round(-$lines->filter(fn (object $line): bool => in_array($line->type, SubscriberTransaction::CREDIT_TYPES, true))->sum('amount'), 2),
            ])
            ->all();
    }

    /**
     * The period's headline total and line count per branch, largest first.
     *
     * @param  Builder<SubscriberTransaction>  $headline
     * @return array<int, array{id: int, name: string, total: float, count: int}>
     */
    private function branchTotals(Builder $headline): array
    {
        $totals = $headline
            ->join('subscribers', 'subscribers.id', '=', 'subscriber_transactions.subscriber_id')
            ->toBase()
            ->selectRaw('subscribers.branch_id, sum(abs(subscriber_transactions.amount)) as total, count(*) as entries')
            ->groupBy('subscribers.branch_id')
            ->get();

        $names = Branch::query()->whereIn('id', $totals->pluck('branch_id'))->pluck('name', 'id');

        return $totals
            ->map(fn (object $branch): array => [
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
            'day' => DailySeries::localDate($transaction->created_at),
            'time' => DailySeries::localTime($transaction->created_at),
            'subscriberId' => $transaction->subscriber_id,
            'subscriberName' => $transaction->subscriber->displayName(),
            'subscriberAccountNumber' => $transaction->subscriber->account_number,
            'subscriberPhone' => $transaction->subscriber->contactPhone(),
            'subscriberStatus' => $transaction->subscriber->status->value,
            'subscriberStatusLabel' => __($transaction->subscriber->status->label()),
            'branchName' => $transaction->subscriber->branch->name,
            'type' => $transaction->type,
            'typeLabel' => $transaction->typeLabel(),
            'isCredit' => $transaction->isCredit(),
            // Listed, but left out of the totals.
            'isCancelled' => $transaction->isCancelled() || $transaction->isReversal(),
            'recordedByName' => $transaction->recordedBy?->name,
            'amount' => ltrim($transaction->amount, '-'),
        ];
    }

    /**
     * What the log covers, shown above its title: every branch, the branch
     * the Super Admin filtered on, or the user's own branch.
     */
    private function scopeLabel(Request $request, User $actor): string
    {
        if (! $actor->isSuperAdmin()) {
            return $actor->branch?->name ?? '—';
        }

        $branchId = $this->filterValue($request, 'branch_id');

        return ($branchId ? Branch::query()->find($branchId)?->name : null) ?? 'كل الفروع';
    }

    /**
     * The filters: the branch (the Super Admin's only — everyone else's log
     * is their own branch), the type of line or a whole side, and who
     * recorded it.
     *
     * @return array<int, array{key: string, label: string, options: array<int, array{value: string, label: string}>}>
     */
    private function filterOptions(User $actor): array
    {
        $groups = $actor->isSuperAdmin() ? [$this->branchFilterGroup()] : [];

        $groups[] = $this->filterGroup('type', 'نوع القيد', [
            ['value' => self::DEBIT, 'label' => 'كل ما عليه (تحميل)'],
            ['value' => self::CREDIT, 'label' => 'كل ما له (تسديد وخصم ومقاصة)'],
            ...collect(SubscriberTransaction::typeLabels())->map(fn (string $label, string $type): array => ['value' => $type, 'label' => $label])->values(),
        ]);

        $groups[] = $this->filterGroup('recorded_by', 'سجّله', $this->staffOptions(
            User::query()
                ->whereIn('id', SubscriberTransaction::query()
                    ->whereHas('subscriber', fn (Builder $subscribers) => $subscribers->visibleTo($actor))
                    ->select('recorded_by'))
                ->orderBy('name')
                ->get(),
        ));

        return $groups;
    }

    /**
     * Which side the headline figures sum: the credits when the type filter
     * picks payments, discounts, clearings or everything له; otherwise the charges.
     */
    private function headlineSide(Request $request): string
    {
        $type = $this->filterValue($request, 'type');

        return $type === self::CREDIT || in_array($type, SubscriberTransaction::CREDIT_TYPES, true) ? self::CREDIT : self::DEBIT;
    }

    private function period(Request $request): string
    {
        $period = $request->query('period');

        return is_string($period) && array_key_exists($period, self::PERIODS) ? $period : self::DEFAULT_PERIOD;
    }

    /**
     * One `?filter[key]=` value, or null when it is missing, empty or not
     * plain text.
     */
    private function filterValue(Request $request, string $key): ?string
    {
        $value = $request->input("filter.{$key}");

        return is_scalar($value) && (string) $value !== '' ? (string) $value : null;
    }
}
