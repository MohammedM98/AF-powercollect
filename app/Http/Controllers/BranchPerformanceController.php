<?php

namespace App\Http\Controllers;

use App\Enums\SubscriberStatus;
use App\Models\Branch;
use App\Models\MeterReading;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use App\Support\DailySeries;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

/**
 * How each branch is doing: what it charged its subscribers (the lines
 * on their accounts, عليه), its subscribers, and its staff's entries —
 * subscribers registered and weekly readings entered — and when. The
 * Super Admin compares every branch; a branch's own staff go straight to
 * their branch. Read-only.
 */
class BranchPerformanceController extends Controller
{
    /**
     * The sort buttons, and the figure each one ranks branches by.
     */
    private const SORTS = [
        'revenue' => 'chargesTotal',
        'subscribers' => 'activeSubscribers',
        'activity' => 'weekEntries',
    ];

    private const SPARKLINE_DAYS = 14;

    private const CHART_DAYS = 30;

    private const WORK_LOG_DAYS = 14;

    private const LATEST_REGISTRATIONS = 8;

    public function index(Request $request): InertiaResponse|RedirectResponse
    {
        $this->authorize('viewAny', SubscriberTransaction::class);

        $actor = $request->user();

        if (! $actor->isSuperAdmin()) {
            abort_unless($actor->branch_id, 403);

            return redirect()->route('branch-performance.show', $actor->branch_id);
        }

        $sort = $request->query('sort');
        $sort = is_string($sort) && array_key_exists($sort, self::SORTS) ? $sort : 'revenue';

        $branches = $this->withFigures(Branch::query())->with(['governorate', 'area'])->orderBy('name')->get();
        $entries = $this->entriesPerDay($branches->modelKeys(), self::SPARKLINE_DAYS);

        $summaries = $branches
            ->map(fn (Branch $branch): array => $this->branchSummary($branch, $entries[$branch->id] ?? []))
            ->sortByDesc(self::SORTS[$sort])
            ->values()
            ->map(fn (array $branch, int $index): array => [...$branch, 'rank' => $index + 1]);

        return Inertia::render('BranchPerformance/Index', [
            'sort' => $sort,
            'summary' => [
                'branches' => $branches->count(),
                'activeBranches' => $branches->where('is_active', true)->count(),
                'chargesTotal' => round($summaries->sum('chargesTotal'), 2),
                'subscribers' => $summaries->sum('subscribers'),
                'activeSubscribers' => $summaries->sum('activeSubscribers'),
                'weekEntries' => $summaries->sum('weekEntries'),
                'todayEntries' => $summaries->sum('todayEntries'),
                'staff' => $summaries->sum('staff'),
            ],
            'branches' => $summaries,
        ]);
    }

    public function show(Request $request, Branch $branch): InertiaResponse
    {
        $this->authorize('viewForBranch', [SubscriberTransaction::class, $branch]);

        $branch = $this->withFigures(Branch::query())->with(['governorate', 'area'])->findOrFail($branch->id);
        $entries = $this->entriesPerDay([$branch->id], self::CHART_DAYS)[$branch->id] ?? [];
        $charges = fn (): Builder => SubscriberTransaction::query()->charges()->whereHas('subscriber', fn (Builder $query) => $query->where('branch_id', $branch->id));
        $statusCounts = $branch->subscribers()->toBase()->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');

        return Inertia::render('BranchPerformance/Show', [
            'branch' => [
                ...$this->branchSummary($branch, $entries),
                'phone' => $branch->phone,
                'statusCounts' => array_map(fn (array $status): array => [
                    ...$status,
                    'count' => (int) ($statusCounts[$status['value']] ?? 0),
                ], SubscriberStatus::options()),
                'monthChargesTotal' => round((float) $charges()
                    ->where('subscriber_transactions.created_at', '>=', DailySeries::startOfDay(self::CHART_DAYS - 1))
                    ->toBase()
                    ->selectRaw('coalesce(sum(abs(amount)), 0) as total')
                    ->value('total'), 2),
                'monthEntries' => array_sum($entries),
            ],
            'canCompareBranches' => $request->user()->isSuperAdmin(),
            'dailyRegistrations' => DailySeries::counts(Subscriber::query()->where('branch_id', $branch->id), 'subscribers.created_at', self::CHART_DAYS),
            'dailyCharges' => DailySeries::sums($charges(), 'subscriber_transactions.created_at', 'subscriber_transactions.amount', self::CHART_DAYS),
            'team' => $this->team($branch),
            'workLog' => $this->workLog($branch, $charges()),
            'latestRegistrations' => $branch->subscribers()
                ->with('registeredBy')
                ->latest()
                ->latest('id')
                ->take(self::LATEST_REGISTRATIONS)
                ->get()
                ->map(fn (Subscriber $subscriber): array => [
                    'id' => $subscriber->id,
                    'name' => $subscriber->full_name,
                    'phone' => $subscriber->phone,
                    'status' => $subscriber->status->value,
                    'registeredByName' => $subscriber->registeredBy?->name,
                    'createdAt' => $subscriber->created_at->toIso8601String(),
                ]),
        ]);
    }

    /**
     * Adds each branch's subscriber and staff counts, what it charged its
     * subscribers, and when its last subscriber and reading were entered.
     *
     * @param  Builder<Branch>  $query
     * @return Builder<Branch>
     */
    private function withFigures(Builder $query): Builder
    {
        return $query
            ->withCount([
                'subscribers',
                'subscribers as active_subscribers_count' => fn (Builder $subscribers) => $subscribers->where('status', SubscriberStatus::Active),
                'users as staff_count' => fn (Builder $users) => $users->where('is_active', true),
            ])
            ->withSum(['transactions as charges_total' => fn (Builder $lines) => $lines->charges()], 'amount')
            ->withMax('subscribers as last_registration_at', 'created_at')
            ->withMax('meterReadings as last_reading_at', 'created_at');
    }

    /**
     * @param  array<string, int>  $entries  entries per business day
     * @return array<string, mixed>
     */
    private function branchSummary(Branch $branch, array $entries): array
    {
        $sparkline = array_map(fn (string $day): int => $entries[$day] ?? 0, DailySeries::lastDays(self::SPARKLINE_DAYS));
        $lastEntryAt = collect([$branch->last_registration_at, $branch->last_reading_at])->filter()->max();

        return [
            'id' => $branch->id,
            'name' => $branch->name,
            'isActive' => $branch->is_active,
            'governorateName' => $branch->governorate?->name,
            'areaName' => $branch->area?->name,
            'chargesTotal' => round((float) $branch->charges_total, 2),
            'subscribers' => $branch->subscribers_count,
            'activeSubscribers' => $branch->active_subscribers_count,
            'staff' => $branch->staff_count,
            'todayEntries' => $entries[DailySeries::today()->toDateString()] ?? 0,
            'weekEntries' => array_sum(array_slice($sparkline, -7)),
            'sparkline' => $sparkline,
            'lastEntryAt' => $lastEntryAt ? CarbonImmutable::parse($lastEntryAt, 'UTC')->toIso8601String() : null,
        ];
    }

    /**
     * How many entries — subscribers registered and readings entered — each
     * branch made on each of the last `$days` business days.
     *
     * @param  array<int, int>  $branchIds
     * @return array<int, array<string, int>> branch id => [Y-m-d => entries]
     */
    private function entriesPerDay(array $branchIds, int $days): array
    {
        return $this->entries($branchIds, DailySeries::startOfDay($days - 1))
            ->groupBy('branch_id')
            ->map(fn (Collection $entries): array => $entries->countBy(fn (object $entry): string => DailySeries::localDate($entry->created_at))->all())
            ->all();
    }

    /**
     * The branch's staff, busiest first: how many entries each made here
     * (all time and in the last 7 days), the account lines they recorded
     * here — how many, and their total on each side (عليه and له) — and
     * when they last did any of it.
     *
     * @return array<int, array<string, mixed>>
     */
    private function team(Branch $branch): array
    {
        $members = $branch->users()->orderBy('name')->get();
        $weekStart = DailySeries::startOfDay(6);
        $perMember = fn (Builder $query, string $member): Collection => $query
            ->whereIn($member, $members->modelKeys())
            ->toBase()
            ->selectRaw("{$member} as user_id, count(*) as entries, sum(case when created_at >= ? then 1 else 0 end) as week_entries, max(created_at) as last_at", [$weekStart])
            ->groupBy($member)
            ->get()
            ->keyBy('user_id');

        $registrations = $perMember(Subscriber::query()->where('branch_id', $branch->id), 'registered_by');
        $readings = $perMember(MeterReading::query()->where('branch_id', $branch->id), 'recorded_by');
        $credit = implode(', ', array_fill(0, count(SubscriberTransaction::CREDIT_TYPES), '?'));
        $recorded = SubscriberTransaction::query()
            ->counted()
            ->whereIn('recorded_by', $members->modelKeys())
            ->whereHas('subscriber', fn (Builder $query) => $query->where('branch_id', $branch->id))
            ->toBase()
            ->selectRaw(
                "recorded_by as user_id, count(*) as entries, max(created_at) as last_at,
                    sum(case when type in ({$credit}) then 0 else abs(amount) end) as charged,
                    sum(case when type in ({$credit}) then abs(amount) else 0 end) as credited",
                [...SubscriberTransaction::CREDIT_TYPES, ...SubscriberTransaction::CREDIT_TYPES],
            )
            ->groupBy('recorded_by')
            ->get()
            ->keyBy('user_id');

        return $members
            ->map(function (User $member) use ($registrations, $readings, $recorded): array {
                $registered = $registrations[$member->id] ?? null;
                $read = $readings[$member->id] ?? null;
                $lines = $recorded[$member->id] ?? null;
                $lastActivityAt = collect([$registered?->last_at, $read?->last_at, $lines?->last_at])->filter()->max();

                return [
                    'id' => $member->id,
                    'name' => $member->name,
                    'username' => $member->username,
                    'roleLabel' => __($member->role->label()),
                    'isActive' => $member->is_active,
                    'entries' => (int) ($registered?->entries ?? 0) + (int) ($read?->entries ?? 0),
                    'weekEntries' => (int) ($registered?->week_entries ?? 0) + (int) ($read?->week_entries ?? 0),
                    'recordedCount' => (int) ($lines?->entries ?? 0),
                    'recordedCharged' => round((float) ($lines?->charged ?? 0), 2),
                    'recordedCredited' => round((float) ($lines?->credited ?? 0), 2),
                    'lastActivityAt' => $lastActivityAt ? CarbonImmutable::parse($lastActivityAt, 'UTC')->toIso8601String() : null,
                ];
            })
            ->sortByDesc('entries')
            ->values()
            ->all();
    }

    /**
     * The last two weeks, newest first: the day's new subscribers and
     * entries, what was charged, and who made the most entries.
     *
     * @param  Builder<SubscriberTransaction>  $charges
     * @return array<int, array{date: string, newSubscribers: int, entries: int, chargesCount: int, chargesTotal: float, topEntrant: string|null}>
     */
    private function workLog(Branch $branch, Builder $charges): array
    {
        $since = DailySeries::startOfDay(self::WORK_LOG_DAYS - 1);
        $byDay = fn (Collection $rows): Collection => $rows->groupBy(fn (object $row): string => DailySeries::localDate($row->created_at));

        $entries = $byDay($this->entries([$branch->id], $since));
        $charged = $byDay($charges->where('subscriber_transactions.created_at', '>=', $since)->toBase()->get(['subscriber_transactions.created_at', 'amount']));
        $names = User::query()->whereIn('id', $entries->flatten()->pluck('user_id')->unique())->pluck('name', 'id');

        return array_map(function (string $day) use ($entries, $charged, $names): array {
            $dayEntries = $entries[$day] ?? collect();
            $topEntrant = $dayEntries->countBy('user_id')->sortDesc()->keys()->first();

            return [
                'date' => $day,
                'newSubscribers' => $dayEntries->where('kind', 'registration')->count(),
                'entries' => $dayEntries->count(),
                'chargesCount' => ($charged[$day] ?? collect())->count(),
                'chargesTotal' => round(($charged[$day] ?? collect())->sum(fn (object $line): float => abs((float) $line->amount)), 2),
                'topEntrant' => $topEntrant ? ($names[$topEntrant] ?? null) : null,
            ];
        }, array_reverse(DailySeries::lastDays(self::WORK_LOG_DAYS)));
    }

    /**
     * Every entry made in the given branches since `$since`: subscribers
     * registered and readings entered, each with its branch, who made it
     * and when.
     *
     * @param  array<int, int>  $branchIds
     * @return Collection<int, object{branch_id: int, user_id: int, created_at: string, kind: string}>
     */
    private function entries(array $branchIds, CarbonImmutable $since): Collection
    {
        $registrations = Subscriber::query()
            ->whereIn('branch_id', $branchIds)
            ->where('created_at', '>=', $since)
            ->toBase()
            ->selectRaw("branch_id, registered_by as user_id, created_at, 'registration' as kind")
            ->get();

        $readings = MeterReading::query()
            ->whereIn('branch_id', $branchIds)
            ->where('created_at', '>=', $since)
            ->toBase()
            ->selectRaw("branch_id, recorded_by as user_id, created_at, 'reading' as kind")
            ->get();

        return $registrations->concat($readings);
    }
}
