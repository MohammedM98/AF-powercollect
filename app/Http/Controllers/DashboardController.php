<?php

namespace App\Http\Controllers;

use App\Enums\ClosingStatus;
use App\Enums\PermissionKey;
use App\Enums\SubscriptionStatus;
use App\Enums\UserRole;
use App\Http\Concerns\ProvidesFormOptions;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\FinancialAuditStatement;
use App\Models\MeterBox;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\Tariff;
use App\Models\User;
use App\Support\ClosingPeriods;
use App\Support\CollectionFigures;
use App\Support\DailySeries;
use App\Support\DebtAging;
use Illuminate\Database\Eloquent\Builder;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class DashboardController extends Controller
{
    use ProvidesFormOptions;

    /**
     * Every section is built only when the actor is allowed to view that
     * table at all — the same policy checks the resource's own index page
     * uses — so the dashboard naturally differs per user/role without any
     * role name hardcoded here. A user granted nothing sees an empty state.
     */
    public function index(): InertiaResponse
    {
        $actor = auth()->user();
        $scopedToBranch = ! $actor->isSuperAdmin();

        $sections = [];

        if ($actor->can('viewAny', Branch::class)) {
            $sections['branches'] = $this->branchesSection();
        }

        if ($actor->can('viewAny', User::class)) {
            $sections['users'] = $this->usersSection($actor);
        }

        if ($actor->can('viewAny', Subscription::class)) {
            $sections['subscriptions'] = $this->subscriptionsSection($actor);
        }

        if ($actor->can('viewAny', MeterBox::class)) {
            $sections['meterBoxes'] = $this->meterBoxesSection($actor);
        }

        if ($actor->can('viewAny', Tariff::class)) {
            $sections['tariffs'] = ['total' => Tariff::count()];
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
            'money' => $this->moneySection($actor),
            'attention' => $this->attentionItems($actor),
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
     * The money the user's branch (every branch for the Super Admin) took in
     * and is owed, or null when the user may open neither the financial log
     * nor the debts report. What was collected and charged takes the same
     * "View Collections" permission as the log, and what is owed the debt
     * aging permission, so every figure matches the page it comes from.
     *
     * @return array{collected: array{today: float, week: float, month: float}|null, charged: array{month: float}|null, openingDebt: float|null, collectionRate: int|null, outstanding: array{total: float, debtors: int, overNinety: float, overNinetyShare: int}|null, since: array{week: string, month: string}}|null
     */
    private function moneySection(User $actor): ?array
    {
        $canSeeLog = $actor->can('viewAny', SubscriptionTransaction::class);
        $canSeeDebts = $actor->can('viewDebtAging', SubscriptionTransaction::class);

        if (! $canSeeLog && ! $canSeeDebts) {
            return null;
        }

        $branchIds = $this->branchScope($actor);
        $today = ClosingPeriods::today();
        [$weekStart] = ClosingPeriods::week($today);
        [$monthStart] = ClosingPeriods::month($today);
        $sum = fn (array $figures): float => round(array_sum($figures), 2);

        $collectedMonth = $canSeeLog ? $sum(CollectionFigures::collected($monthStart, $today, $branchIds)) : 0.0;
        $chargedMonth = $canSeeLog ? $sum(CollectionFigures::charged($monthStart, $today, $branchIds)) : 0.0;
        $openingDebt = $canSeeLog ? $sum(CollectionFigures::openingDebt($monthStart, $branchIds)) : 0.0;

        return [
            'collected' => $canSeeLog ? [
                'today' => $sum(CollectionFigures::collected($today, $today, $branchIds)),
                'week' => $sum(CollectionFigures::collected($weekStart, $today, $branchIds)),
                'month' => $collectedMonth,
            ] : null,
            'charged' => $canSeeLog ? ['month' => $chargedMonth] : null,
            'openingDebt' => $canSeeLog ? $openingDebt : null,
            'collectionRate' => $canSeeLog ? CollectionFigures::rate($collectedMonth, $openingDebt + $chargedMonth) : null,
            'outstanding' => $canSeeDebts ? $this->outstandingDebt($actor) : null,
            'since' => ['week' => $weekStart->toDateString(), 'month' => $monthStart->toDateString()],
        ];
    }

    /**
     * What the user's subscriptions owe in all and how much of it is older
     * than 90 days — worked out by the debts report's own aging, so the two
     * pages always agree.
     *
     * @return array{total: float, debtors: int, overNinety: float, overNinetyShare: int}
     */
    private function outstandingDebt(User $actor): array
    {
        $debtors = (new DebtAging(DailySeries::today()))->debtors(Subscription::query()->visibleTo($actor));
        $total = $debtors->sum('balance');
        $overNinety = $debtors->sum(fn (array $debtor): int => $debtor['buckets']['older']);

        return [
            'total' => round($total / 100, 2),
            'debtors' => $debtors->count(),
            'overNinety' => round($overNinety / 100, 2),
            'overNinetyShare' => $total > 0 ? (int) round($overNinety / $total * 100) : 0,
        ];
    }

    /**
     * What is waiting on the user: closings sent for review, audit statements
     * to audit, and statements the audit sent back to the branch. Each is
     * listed only for someone who may open the page it leads to, with the
     * count even when it is zero, so "nothing waiting" is an answer too.
     *
     * @return array<int, array{key: string, label: string, count: int, href: string}>
     */
    private function attentionItems(User $actor): array
    {
        $items = [];

        if ($actor->can('viewAny', Closing::class)) {
            $items[] = [
                'key' => 'closings',
                'label' => 'إقفالات بانتظار المراجعة',
                'count' => Closing::query()
                    ->where('status', ClosingStatus::Submitted)
                    ->when(! $actor->can('viewAllBranches', Closing::class), fn (Builder $query) => $query->where('branch_id', $actor->branch_id))
                    ->count(),
                'href' => '/closings',
            ];
        }

        if ($actor->can('viewAny', FinancialAuditStatement::class)) {
            $items[] = [
                'key' => 'audit',
                'label' => 'كشوف بانتظار التدقيق',
                'count' => FinancialAuditStatement::query()->whereIn('status', ['pending', 'under_audit'])->count(),
                'href' => '/financial-audit',
            ];
        }

        if ($actor->can('viewBranchStatements', FinancialAuditStatement::class)) {
            $items[] = [
                'key' => 'returned',
                'label' => 'كشوف أعادها التدقيق للرد',
                'count' => FinancialAuditStatement::query()
                    ->where('status', 'returned')
                    ->when(! $actor->isSuperAdmin(), fn (Builder $query) => $query->where('branch_id', $actor->branch_id))
                    ->count(),
                'href' => '/closings/audit-statements',
            ];
        }

        return $items;
    }

    /**
     * The branches whose money the user sees: null for every branch (the
     * Super Admin), otherwise their own.
     *
     * @return array<int, int>|null
     */
    private function branchScope(User $actor): ?array
    {
        return $actor->isSuperAdmin() ? null : array_filter([$actor->branch_id]);
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
    private function usersSection(User $actor): array
    {
        $users = fn () => User::query()->visibleTo($actor);
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
    private function subscriptionsSection(User $actor): array
    {
        $subscriptions = fn () => Subscription::query()->visibleTo($actor);
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
    private function meterBoxesSection(User $actor): array
    {
        $meterBoxes = fn () => MeterBox::query()->visibleTo($actor);

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
     * `$part` as a whole-number percentage of `$total` (0 when there is
     * nothing to count).
     */
    private function percentage(int $part, int $total): int
    {
        return $total > 0 ? (int) round($part / $total * 100) : 0;
    }
}
