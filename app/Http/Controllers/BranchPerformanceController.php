<?php

namespace App\Http\Controllers;

use App\Enums\SubscriberStatus;
use App\Http\Concerns\BuildsDailySeries;
use App\Models\Branch;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

/**
 * How each branch is doing: its ledger total, subscribers, and how many
 * subscribers its staff registered ("entries") and when. The Super Admin
 * compares every branch; everyone else sees their own. Read-only.
 */
class BranchPerformanceController extends Controller
{
    use BuildsDailySeries;

    /**
     * The sort buttons, and the figure each one ranks branches by.
     */
    private const SORTS = [
        'revenue' => 'ledger_total',
        'subscribers' => 'active_subscribers_count',
        'activity' => 'week_entries_count',
    ];

    private const SPARKLINE_DAYS = 14;

    private const CHART_DAYS = 30;

    private const WORK_LOG_DAYS = 14;

    private const LATEST_ENTRIES = 8;

    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', SubscriberTransaction::class);

        $actor = $request->user();
        $sort = $request->input('sort');
        $sort = is_string($sort) && array_key_exists($sort, self::SORTS) ? $sort : 'revenue';

        $branches = $this->withFigures(Branch::query())
            ->when(! $actor->isSuperAdmin(), fn (Builder $query) => $query->whereKey($actor->branch_id))
            ->with(['governorate', 'area'])
            ->orderBy('name')
            ->get()
            ->sortByDesc(fn (Branch $branch) => (float) $branch->{self::SORTS[$sort]})
            ->values();

        $sparklines = $this->entrySparklines($branches);

        return Inertia::render('BranchPerformance/Index', [
            'sort' => $sort,
            'summary' => [
                'branches' => $branches->count(),
                'activeBranches' => $branches->where('is_active', true)->count(),
                'ledgerTotal' => round((float) $branches->sum('ledger_total'), 2),
                'subscribers' => (int) $branches->sum('subscribers_count'),
                'activeSubscribers' => (int) $branches->sum('active_subscribers_count'),
                'weekEntries' => (int) $branches->sum('week_entries_count'),
                'todayEntries' => (int) $branches->sum('today_entries_count'),
                'staff' => (int) $branches->sum('staff_count'),
            ],
            'branches' => $branches->map(fn (Branch $branch, int $index) => [
                ...$this->branchSummary($branch),
                'rank' => $index + 1,
                'sparkline' => $sparklines[$branch->id] ?? [],
            ]),
        ]);
    }

    public function show(Branch $branch): InertiaResponse
    {
        $this->authorize('viewForBranch', [SubscriberTransaction::class, $branch]);

        $branch = $this->withFigures(Branch::query())->with(['governorate', 'area'])->findOrFail($branch->id);
        $ledger = SubscriberTransaction::query()->charges()->whereHas('subscriber', fn (Builder $query) => $query->where('branch_id', $branch->id));
        $subscribers = Subscriber::query()->where('branch_id', $branch->id);

        return Inertia::render('BranchPerformance/Show', [
            'branch' => [
                ...$this->branchSummary($branch),
                'phone' => $branch->phone,
                'statusCounts' => $branch->subscribers()
                    ->selectRaw('status, count(*) as total')
                    ->groupBy('status')
                    ->pluck('total', 'status')
                    ->map(fn ($total) => (int) $total),
                'monthLedgerTotal' => round((float) (clone $ledger)->where('subscriber_transactions.created_at', '>=', today()->subDays(self::CHART_DAYS - 1))->sum('amount'), 2),
                'monthEntries' => (clone $subscribers)->where('created_at', '>=', today()->subDays(self::CHART_DAYS - 1))->count(),
            ],
            'dailyEntries' => $this->dailySeries($subscribers, 'subscribers.created_at', 'count(*)', self::CHART_DAYS),
            'dailyLedger' => $this->dailySeries($ledger, 'subscriber_transactions.created_at', 'sum(subscriber_transactions.amount)', self::CHART_DAYS),
            'team' => $this->team($branch),
            'latestEntries' => $branch->subscribers()
                ->with('registeredBy')
                ->latest()
                ->latest('id')
                ->take(self::LATEST_ENTRIES)
                ->get()
                ->map(fn (Subscriber $subscriber) => [
                    'id' => $subscriber->id,
                    'name' => $subscriber->full_name,
                    'phone' => $subscriber->phone,
                    'status' => $subscriber->status->value,
                    'registeredByName' => $subscriber->registeredBy?->name,
                    'createdAt' => $subscriber->created_at->toIso8601String(),
                ]),
            'workLog' => $this->workLog($ledger, $subscribers),
        ]);
    }

    /**
     * Adds each branch's figures: subscriber counts, entries today and in
     * the last 7 days, staff, ledger total and when the last entry was made.
     *
     * @param  Builder<Branch>  $query
     * @return Builder<Branch>
     */
    private function withFigures(Builder $query): Builder
    {
        return $query
            ->withCount([
                'subscribers',
                'subscribers as active_subscribers_count' => fn (Builder $query) => $query->where('status', SubscriberStatus::Active),
                'subscribers as today_entries_count' => fn (Builder $query) => $query->where('created_at', '>=', today()),
                'subscribers as week_entries_count' => fn (Builder $query) => $query->where('created_at', '>=', today()->subDays(6)),
                'users as staff_count',
            ])
            ->withSum(['transactions as ledger_total' => fn (Builder $query) => $query->charges()], 'amount')
            ->withMax('subscribers as last_entry_at', 'created_at');
    }

    /**
     * @return array<string, mixed>
     */
    private function branchSummary(Branch $branch): array
    {
        return [
            'id' => $branch->id,
            'name' => $branch->name,
            'isActive' => $branch->is_active,
            'governorateName' => $branch->governorate?->name,
            'areaName' => $branch->area?->name,
            'ledgerTotal' => round((float) $branch->ledger_total, 2),
            'subscribers' => $branch->subscribers_count,
            'activeSubscribers' => $branch->active_subscribers_count,
            'todayEntries' => $branch->today_entries_count,
            'weekEntries' => $branch->week_entries_count,
            'staff' => $branch->staff_count,
            'lastEntryAt' => $branch->last_entry_at ? $this->isoDate($branch->last_entry_at) : null,
        ];
    }

    /**
     * Subscribers registered per day over the last two weeks, per branch.
     *
     * @param  Collection<int, Branch>  $branches
     * @return array<int, array<int, int>>
     */
    private function entrySparklines(Collection $branches): array
    {
        $from = today()->subDays(self::SPARKLINE_DAYS - 1);
        $days = $this->calendarDays($from, self::SPARKLINE_DAYS);

        $counts = Subscriber::query()
            ->whereIn('branch_id', $branches->pluck('id'))
            ->where('created_at', '>=', $from)
            ->selectRaw('branch_id, date(created_at) as day, count(*) as entries')
            ->groupBy('branch_id', 'day')
            ->get()
            ->groupBy('branch_id');

        return $branches->mapWithKeys(function (Branch $branch) use ($counts, $days) {
            $byDay = ($counts[$branch->id] ?? collect())->pluck('entries', 'day');

            return [$branch->id => array_map(fn (string $day) => (int) ($byDay[$day] ?? 0), $days)];
        })->all();
    }

    /**
     * The branch's staff, busiest first: how many subscribers each
     * registered here (all time and this week), the ledger entries they
     * recorded for this branch, and when they last did either.
     *
     * @return array<int, array<string, mixed>>
     */
    private function team(Branch $branch): array
    {
        $members = $branch->users()
            ->withCount([
                'registeredSubscribers as entries_count' => fn (Builder $query) => $query->where('branch_id', $branch->id),
                'registeredSubscribers as week_entries_count' => fn (Builder $query) => $query
                    ->where('branch_id', $branch->id)
                    ->where('created_at', '>=', today()->subDays(6)),
            ])
            ->withMax(['registeredSubscribers as last_entry_at' => fn (Builder $query) => $query->where('branch_id', $branch->id)], 'created_at')
            ->get();

        $recorded = SubscriberTransaction::query()
            ->charges()
            ->whereIn('recorded_by', $members->modelKeys())
            ->whereHas('subscriber', fn (Builder $query) => $query->where('branch_id', $branch->id))
            ->selectRaw('recorded_by, sum(amount) as total, max(created_at) as last_recorded_at')
            ->groupBy('recorded_by')
            ->get()
            ->keyBy('recorded_by');

        return $members
            ->map(function (User $member) use ($recorded) {
                $ledger = $recorded[$member->id] ?? null;
                $lastActivity = collect([$member->last_entry_at, $ledger?->last_recorded_at])->filter()->max();

                return [
                    'id' => $member->id,
                    'name' => $member->name,
                    'username' => $member->username,
                    'roleLabel' => __($member->role->label()),
                    'isActive' => $member->is_active,
                    'entries' => $member->entries_count,
                    'weekEntries' => $member->week_entries_count,
                    'recordedTotal' => round((float) ($ledger?->total ?? 0), 2),
                    'lastActivityAt' => $lastActivity ? $this->isoDate($lastActivity) : null,
                ];
            })
            ->sortByDesc('entries')
            ->values()
            ->all();
    }

    /**
     * The last two weeks, newest first: new subscribers, ledger entries and
     * their total, and who registered the most subscribers that day.
     *
     * @param  Builder<SubscriberTransaction>  $ledger
     * @param  Builder<Subscriber>  $subscribers
     * @return array<int, array{date: string, entries: int, ledgerCount: int, ledgerTotal: float, topRegistrar: string|null}>
     */
    private function workLog(Builder $ledger, Builder $subscribers): array
    {
        $from = today()->subDays(self::WORK_LOG_DAYS - 1);

        $ledgerByDay = (clone $ledger)
            ->where('subscriber_transactions.created_at', '>=', $from)
            ->selectRaw('date(subscriber_transactions.created_at) as day, count(*) as entries, sum(subscriber_transactions.amount) as total')
            ->groupBy('day')
            ->get()
            ->keyBy('day');

        $registrations = (clone $subscribers)
            ->where('created_at', '>=', $from)
            ->selectRaw('date(created_at) as day, registered_by, count(*) as entries')
            ->groupBy('day', 'registered_by')
            ->get()
            ->groupBy('day');

        $names = User::whereIn('id', $registrations->flatten()->pluck('registered_by')->unique())->pluck('name', 'id');

        return collect($this->calendarDays($from, self::WORK_LOG_DAYS))
            ->reverse()
            ->map(function (string $day) use ($ledgerByDay, $registrations, $names) {
                $registered = $registrations[$day] ?? collect();
                $top = $registered->sortByDesc('entries')->first();

                return [
                    'date' => $day,
                    'entries' => (int) $registered->sum('entries'),
                    'ledgerCount' => (int) ($ledgerByDay[$day]->entries ?? 0),
                    'ledgerTotal' => round((float) ($ledgerByDay[$day]->total ?? 0), 2),
                    'topRegistrar' => $top ? ($names[$top->registered_by] ?? null) : null,
                ];
            })
            ->values()
            ->all();
    }

    /**
     * A raw aggregate timestamp (as the database returns it) in ISO 8601.
     */
    private function isoDate(string $value): string
    {
        return Carbon::parse($value)->toIso8601String();
    }
}
