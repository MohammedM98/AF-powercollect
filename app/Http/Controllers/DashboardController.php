<?php

namespace App\Http\Controllers;

use App\Enums\PaymentMethod;
use App\Enums\PermissionKey;
use App\Enums\SubscriptionStatus;
use App\Enums\UserRole;
use App\Http\Concerns\ProvidesFormOptions;
use App\Models\Branch;
use App\Models\CircuitBreaker;
use App\Models\MeterBox;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\Tariff;
use App\Models\User;
use App\Support\DailySeries;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class DashboardController extends Controller
{
    use ProvidesFormOptions;

    /** The days the collection chart covers, ending today. */
    private const CHART_DAYS = 30;

    /** Enough days back to reach the first day of last month from any day of this one. */
    private const SERIES_DAYS = 62;

    private const TOP_COLLECTORS = 5;

    private const TOP_BRANCHES = 8;

    private const TOP_BREAKERS = 5;

    /**
     * Every section is built only when the actor is allowed to view that
     * table at all — the same policy checks the resource's own index page
     * uses — so the dashboard naturally differs per user/role without any
     * role name hardcoded here. A user granted nothing sees an empty state.
     *
     * A Super Admin may narrow the branch-owned figures to one branch with
     * `?branch=`; everyone else is always held to their own branch.
     */
    public function index(Request $request): InertiaResponse
    {
        $actor = $request->user();
        $scopedToBranch = ! $actor->isSuperAdmin();
        $branch = $this->chosenBranch($request, $actor);

        $sections = [];

        if ($actor->can('viewAny', Branch::class)) {
            $sections['branches'] = $this->branchesSection();
        }

        if ($actor->can('viewAny', User::class)) {
            $sections['users'] = $this->usersSection($actor, $branch);
        }

        if ($actor->can('viewAny', Subscription::class)) {
            $sections['subscriptions'] = $this->subscriptionsSection($actor, $branch);
        }

        if ($actor->can('viewAny', MeterBox::class)) {
            $sections['meterBoxes'] = $this->meterBoxesSection($actor, $branch);
        }

        if ($actor->can('viewAny', Tariff::class)) {
            $sections['tariffs'] = ['total' => Tariff::count()];
        }

        if ($actor->can('viewAny', SubscriptionTransaction::class)) {
            $sections['collections'] = $this->collectionsSection($actor, $branch);
        }

        if ($actor->can('viewAny', CircuitBreaker::class)) {
            $sections['circuitBreakers'] = $this->circuitBreakersSection($actor, $branch);
        }

        $hour = now()->hour;
        $greeting = match (true) {
            $hour < 12 => __('Good morning'),
            $hour < 18 => __('Good afternoon'),
            default => __('Good evening'),
        };

        return Inertia::render('Dashboard', [
            'greeting' => $greeting,
            'scopedToBranch' => $scopedToBranch,
            'sections' => $sections,
            // The Super Admin's branch picker, once there is more than one branch to pick from.
            'branchFilter' => $actor->isSuperAdmin() && Branch::count() > 1 ? [
                'selected' => $branch?->id,
                'options' => Branch::orderBy('name')->get(['id', 'name'])->map(fn (Branch $option) => ['value' => $option->id, 'label' => $option->name])->all(),
            ] : null,
            'canCreateSubscription' => $actor->can('create', Subscription::class),
            // Someone whose work is in the field app and who has nothing to see here is told so.
            'fieldApp' => $sections === [] && ($actor->hasPermission(PermissionKey::RecordCollections) || $actor->hasPermission(PermissionKey::RecordMeterReadings))
                ? ['url' => config('powercollect.mobile_app_url')]
                : null,
            'canCreateBranch' => $actor->can('create', Branch::class),
            'canCreateUser' => $actor->can('create', User::class),
            // The "new branch/user" pop-up's dropdowns, loaded only when its button is clicked.
            'branchForm' => Inertia::optional(fn () => $actor->can('create', Branch::class) ? $this->branchFormOptions() : null),
            'userForm' => Inertia::optional(fn () => $actor->can('create', User::class)
                ? [...$this->userBranchOptions(), 'roleOptions' => $this->userRoleOptions(null)]
                : null),
        ]);
    }

    /**
     * @return array{total: int, active: int, activePct: int, recent: array<int, array{id: int, name: string, subtitle: ?string, active: bool}>}
     */
    private function branchesSection(): array
    {
        $total = Branch::count();
        $active = Branch::where('is_active', true)->count();

        return [
            'total' => $total,
            'active' => $active,
            'activePct' => $this->percentage($active, $total),
            'recent' => Branch::latest()->latest('id')->take(5)->get()->map(fn (Branch $branch) => [
                'id' => $branch->id,
                'name' => $branch->name,
                'subtitle' => $branch->phone,
                'active' => $branch->is_active,
            ])->all(),
        ];
    }

    /**
     * @return array{total: int, active: int, activePct: int, branchAdmins: int, collectors: int, recent: array<int, array{id: int, name: string, subtitle: string}>}
     */
    private function usersSection(User $actor, ?Branch $branch): array
    {
        $users = fn () => User::query()->visibleTo($actor)->when($branch, fn (Builder $query) => $query->where('branch_id', $branch->id));
        $total = $users()->count();
        $active = $users()->where('is_active', true)->count();

        return [
            'total' => $total,
            'active' => $active,
            'activePct' => $this->percentage($active, $total),
            'branchAdmins' => $users()->where('role', UserRole::BranchAdmin)->count(),
            'collectors' => $users()->where('role', UserRole::Collector)->count(),
            'recent' => $users()->with('userType')->latest()->latest('id')->take(5)->get()->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'subtitle' => $user->userType?->name ?? __($user->role->label()),
            ])->all(),
        ];
    }

    /**
     * @return array{total: int, active: int, activePct: int, recent: array<int, array{id: int, name: string, subtitle: ?string}>}
     */
    private function subscriptionsSection(User $actor, ?Branch $branch): array
    {
        $subscriptions = fn () => $this->subscriptionsFor($actor, $branch);
        $total = $subscriptions()->count();
        $active = $subscriptions()->where('status', SubscriptionStatus::Active)->count();

        return [
            'total' => $total,
            'active' => $active,
            'activePct' => $this->percentage($active, $total),
            'recent' => $subscriptions()->latest()->latest('id')->take(5)->get()->map(fn (Subscription $subscription) => [
                'id' => $subscription->id,
                'name' => $subscription->displayName(),
                'subtitle' => $subscription->contactPhone(),
            ])->all(),
        ];
    }

    /**
     * @return array{total: int, recent: array<int, array{id: int, name: ?string, subtitle: ?string}>}
     */
    private function meterBoxesSection(User $actor, ?Branch $branch): array
    {
        $meterBoxes = fn () => MeterBox::query()->visibleTo($actor)->when($branch, fn (Builder $query) => $query->where('branch_id', $branch->id));

        return [
            'total' => $meterBoxes()->count(),
            'recent' => $meterBoxes()->with('branch')->latest()->latest('id')->take(5)->get()->map(fn (MeterBox $meterBox) => [
                'id' => $meterBox->id,
                'name' => $meterBox->displayName(),
                'subtitle' => $meterBox->branch->name,
            ])->all(),
        ];
    }

    /**
     * What was collected: the payments taken (cancelled ones left out) on
     * the subscriptions the actor may see — today and yesterday, the last
     * seven whole days and the seven before them, this month so far and all
     * of last month — one figure per day for the chart, how it was paid
     * and who collected the most over the chart's days. A Super Admin
     * looking at every branch also gets the branches ranked by it.
     *
     * @return array<string, mixed>
     */
    private function collectionsSection(User $actor, ?Branch $branch): array
    {
        $payments = fn (): Builder => SubscriptionTransaction::query()
            ->counted()
            ->where('subscription_transactions.type', SubscriptionTransaction::TYPE_PAYMENT)
            ->when(
                ! $actor->isSuperAdmin() || $branch,
                fn (Builder $query) => $query->whereIn('subscription_transactions.subscription_id', $this->subscriptionsFor($actor, $branch)->select('subscriptions.id')),
            );

        $days = DailySeries::sums($payments(), 'subscription_transactions.created_at', 'subscription_transactions.amount', self::SERIES_DAYS);
        $between = function (string $from, string $until) use ($days): array {
            $inRange = array_filter($days, fn (array $day): bool => $day['date'] >= $from && $day['date'] <= $until);

            return [
                'total' => round(array_sum(array_column($inRange, 'value')), 2),
                'payments' => array_sum(array_column($inRange, 'count')),
            ];
        };

        $today = DailySeries::today();
        $lastMonth = $today->subMonthNoOverflow();
        $since = DailySeries::startOfDay(self::CHART_DAYS - 1);
        $methods = $payments()
            ->where('subscription_transactions.created_at', '>=', $since)
            ->toBase()
            ->selectRaw('subscription_transactions.payment_method as method, coalesce(sum(abs(subscription_transactions.amount)), 0) as total')
            ->groupBy('subscription_transactions.payment_method')
            ->pluck('total', 'method');
        $cash = round((float) ($methods[PaymentMethod::Cash->value] ?? 0), 2);

        return [
            'today' => $between($today->toDateString(), $today->toDateString()),
            'yesterday' => $between($today->subDay()->toDateString(), $today->subDay()->toDateString()),
            'week' => $between($today->subDays(7)->toDateString(), $today->subDay()->toDateString()),
            'previousWeek' => $between($today->subDays(14)->toDateString(), $today->subDays(8)->toDateString()),
            'month' => $between($today->startOfMonth()->toDateString(), $today->toDateString()),
            'lastMonth' => $between($lastMonth->startOfMonth()->toDateString(), $lastMonth->endOfMonth()->toDateString()),
            'daily' => array_values(array_slice($days, -self::CHART_DAYS)),
            'methods' => ['cash' => $cash, 'transfers' => round((float) $methods->sum() - $cash, 2)],
            'collectors' => $this->topCollectors($payments()->where('subscription_transactions.created_at', '>=', $since)),
            'branches' => $actor->isSuperAdmin() && ! $branch
                ? $this->branchRanking($payments()->where('subscription_transactions.created_at', '>=', $since))
                : null,
        ];
    }

    /**
     * Who took the most of `$payments`, with their branch.
     *
     * @param  Builder<SubscriptionTransaction>  $payments
     * @return array<int, array{id: int, name: string, branch: ?string, total: float, payments: int}>
     */
    private function topCollectors(Builder $payments): array
    {
        $rows = $payments
            ->toBase()
            ->selectRaw('subscription_transactions.recorded_by as user_id, coalesce(sum(abs(subscription_transactions.amount)), 0) as total, count(*) as payments')
            ->groupBy('subscription_transactions.recorded_by')
            ->orderByDesc('total')
            ->orderBy('user_id')
            ->limit(self::TOP_COLLECTORS)
            ->get();
        $people = User::query()->with('branch')->whereIn('id', $rows->pluck('user_id'))->get()->keyBy('id');

        return $rows->map(fn (object $row): array => [
            'id' => (int) $row->user_id,
            'name' => $people->get($row->user_id)?->name ?? '—',
            'branch' => $people->get($row->user_id)?->branch?->name,
            'total' => round((float) $row->total, 2),
            'payments' => (int) $row->payments,
        ])->values()->all();
    }

    /**
     * Every branch with what `$payments` brought in on its subscriptions,
     * the most first (a branch that collected nothing still shows, at 0).
     *
     * @param  Builder<SubscriptionTransaction>  $payments
     * @return array<int, array{id: int, name: string, active: bool, total: float, payments: int}>
     */
    private function branchRanking(Builder $payments): array
    {
        $totals = $payments
            ->join('subscriptions', 'subscriptions.id', '=', 'subscription_transactions.subscription_id')
            ->toBase()
            ->selectRaw('subscriptions.branch_id as branch_id, coalesce(sum(abs(subscription_transactions.amount)), 0) as total, count(*) as payments')
            ->groupBy('subscriptions.branch_id')
            ->get()
            ->keyBy('branch_id');

        return Branch::query()
            ->get(['id', 'name', 'is_active'])
            ->map(fn (Branch $branch): array => [
                'id' => $branch->id,
                'name' => $branch->name,
                'active' => $branch->is_active,
                'total' => round((float) ($totals->get($branch->id)?->total ?? 0), 2),
                'payments' => (int) ($totals->get($branch->id)?->payments ?? 0),
            ])
            ->sortBy([['total', 'desc'], ['name', 'asc']])
            ->take(self::TOP_BRANCHES)
            ->values()
            ->all();
    }

    /**
     * The breaker sizes (أمبير) defined, and — for someone who may see the
     * subscriptions — the sizes the active subscriptions use most.
     *
     * @return array{total: int, usage: array<int, array{ampere: int, subscriptions: int}>|null}
     */
    private function circuitBreakersSection(User $actor, ?Branch $branch): array
    {
        $usage = null;

        if ($actor->can('viewAny', Subscription::class)) {
            $counts = $this->subscriptionsFor($actor, $branch)
                ->where('subscriptions.status', SubscriptionStatus::Active)
                ->whereNotNull('subscriptions.circuit_breaker_id')
                ->toBase()
                ->selectRaw('subscriptions.circuit_breaker_id as breaker_id, count(*) as total')
                ->groupBy('subscriptions.circuit_breaker_id')
                ->orderByDesc('total')
                ->orderBy('breaker_id')
                ->limit(self::TOP_BREAKERS)
                ->get();
            $amperes = CircuitBreaker::query()->whereIn('id', $counts->pluck('breaker_id'))->pluck('ampere', 'id');

            $usage = $counts->map(fn (object $row): array => [
                'ampere' => (int) $amperes->get($row->breaker_id),
                'subscriptions' => (int) $row->total,
            ])->values()->all();
        }

        return ['total' => CircuitBreaker::count(), 'usage' => $usage];
    }

    /**
     * The subscriptions the actor may see, narrowed to `$branch` when one is chosen.
     *
     * @return Builder<Subscription>
     */
    private function subscriptionsFor(User $actor, ?Branch $branch): Builder
    {
        return Subscription::query()
            ->visibleTo($actor)
            ->when($branch, fn (Builder $query) => $query->where('subscriptions.branch_id', $branch->id));
    }

    /**
     * The branch a Super Admin chose with `?branch=`, or null for every
     * branch. Always null for anyone else, whose figures are held to their
     * own branch already; a branch that no longer exists is ignored.
     */
    private function chosenBranch(Request $request, User $actor): ?Branch
    {
        $id = $request->query('branch');

        if (! $actor->isSuperAdmin() || ! is_string($id) || ! ctype_digit($id)) {
            return null;
        }

        return Branch::find((int) $id);
    }

    /**
     * `$part` as a whole-number percentage of `$total` (0 when there is
     * nothing to count).
     */
    private function percentage(int $part, int $total): int
    {
        return $total > 0 ? (int) round($part / $total * 100) : 0;
    }
}
