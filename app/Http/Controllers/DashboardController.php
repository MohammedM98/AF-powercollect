<?php

namespace App\Http\Controllers;

use App\Enums\SubscriberStatus;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\MeterBox;
use App\Models\Subscriber;
use App\Models\Tariff;
use App\Models\User;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class DashboardController extends Controller
{
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

        if ($actor->can('viewAny', Subscriber::class)) {
            $sections['subscribers'] = $this->subscribersSection($actor);
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
            'canCreateBranch' => $actor->can('create', Branch::class),
            'canCreateUser' => $actor->can('create', User::class),
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
            'recent' => $users()->latest()->latest('id')->take(5)->get()->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'subtitle' => __($user->role->label()),
            ])->all(),
        ];
    }

    /**
     * @return array{total: int, active: int, activePct: int, recent: array<int, array{id: int, name: string, subtitle: ?string}>}
     */
    private function subscribersSection(User $actor): array
    {
        $subscribers = fn () => Subscriber::query()->visibleTo($actor);
        $total = $subscribers()->count();
        $active = $subscribers()->where('status', SubscriberStatus::Active)->count();

        return [
            'total' => $total,
            'active' => $active,
            'activePct' => $this->percentage($active, $total),
            'recent' => $subscribers()->latest()->latest('id')->take(5)->get()->map(fn (Subscriber $subscriber) => [
                'id' => $subscriber->id,
                'name' => $subscriber->full_name,
                'subtitle' => $subscriber->phone,
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
                'name' => $meterBox->name,
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
