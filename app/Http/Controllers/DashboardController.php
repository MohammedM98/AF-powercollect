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
            $sections['users'] = $this->usersSection($actor, $scopedToBranch);
        }

        if ($actor->can('viewAny', Subscriber::class)) {
            $sections['subscribers'] = $this->subscribersSection($actor, $scopedToBranch);
        }

        if ($actor->can('viewAny', MeterBox::class)) {
            $sections['meterBoxes'] = $this->meterBoxesSection($actor, $scopedToBranch);
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
        $branches = Branch::orderByDesc('created_at')->get();
        $active = $branches->where('is_active', true)->count();

        return [
            'total' => $branches->count(),
            'active' => $active,
            'activePct' => $branches->count() > 0 ? (int) round($active / $branches->count() * 100) : 0,
            'recent' => $branches->take(5)->map(fn (Branch $branch) => [
                'id' => $branch->id,
                'name' => $branch->name,
                'subtitle' => $branch->phone,
                'active' => $branch->is_active,
            ])->values()->all(),
        ];
    }

    /**
     * @return array{total: int, active: int, activePct: int, branchAdmins: int, collectors: int, recent: array<int, array{id: int, name: string, subtitle: string}>}
     */
    private function usersSection(User $actor, bool $scopedToBranch): array
    {
        $users = User::with('branch')
            ->when($scopedToBranch, fn ($query) => $query->where('branch_id', $actor->branch_id))
            ->orderByDesc('created_at')
            ->get();
        $active = $users->where('is_active', true)->count();

        return [
            'total' => $users->count(),
            'active' => $active,
            'activePct' => $users->count() > 0 ? (int) round($active / $users->count() * 100) : 0,
            'branchAdmins' => $users->where('role', UserRole::BranchAdmin)->count(),
            'collectors' => $users->where('role', UserRole::Collector)->count(),
            'recent' => $users->take(5)->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'subtitle' => __($user->role->label()),
            ])->values()->all(),
        ];
    }

    /**
     * @return array{total: int, active: int, activePct: int, recent: array<int, array{id: int, name: string, subtitle: ?string}>}
     */
    private function subscribersSection(User $actor, bool $scopedToBranch): array
    {
        $subscribers = Subscriber::when($scopedToBranch, fn ($query) => $query->where('branch_id', $actor->branch_id))
            ->orderByDesc('created_at')
            ->get();
        $active = $subscribers->where('status', SubscriberStatus::Active)->count();

        return [
            'total' => $subscribers->count(),
            'active' => $active,
            'activePct' => $subscribers->count() > 0 ? (int) round($active / $subscribers->count() * 100) : 0,
            'recent' => $subscribers->take(5)->map(fn (Subscriber $subscriber) => [
                'id' => $subscriber->id,
                'name' => $subscriber->full_name,
                'subtitle' => $subscriber->phone,
            ])->values()->all(),
        ];
    }

    /**
     * @return array{total: int, recent: array<int, array{id: int, name: ?string, subtitle: ?string}>}
     */
    private function meterBoxesSection(User $actor, bool $scopedToBranch): array
    {
        $meterBoxes = MeterBox::with('branch')
            ->when($scopedToBranch, fn ($query) => $query->where('branch_id', $actor->branch_id))
            ->orderByDesc('created_at')
            ->get();

        return [
            'total' => $meterBoxes->count(),
            'recent' => $meterBoxes->take(5)->map(fn (MeterBox $meterBox) => [
                'id' => $meterBox->id,
                'name' => $meterBox->name,
                'subtitle' => $meterBox->branch->name,
            ])->values()->all(),
        ];
    }
}
