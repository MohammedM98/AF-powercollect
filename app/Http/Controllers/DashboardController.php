<?php

namespace App\Http\Controllers;

use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\User;
use Illuminate\Contracts\View\View;

class DashboardController extends Controller
{
    public function index(): View
    {
        $actor = auth()->user();
        $scopedToBranch = ! $actor->isSuperAdmin();

        $branches = Branch::query()
            ->when($scopedToBranch, fn ($query) => $query->whereKey($actor->branch_id))
            ->orderByDesc('created_at')
            ->get();

        $users = User::query()
            ->with('branch')
            ->when($scopedToBranch, fn ($query) => $query->where('branch_id', $actor->branch_id))
            ->orderByDesc('created_at')
            ->get();

        $branchesTotal = $branches->count();
        $branchesActive = $branches->where('is_active', true)->count();
        $usersTotal = $users->count();
        $usersActive = $users->where('is_active', true)->count();
        $branchAdmins = $users->where('role', UserRole::BranchAdmin)->count();
        $collectors = $users->where('role', UserRole::Collector)->count();

        $stats = [
            'branches_total' => $branchesTotal,
            'branches_active' => $branchesActive,
            'branches_active_pct' => $branchesTotal > 0 ? round($branchesActive / $branchesTotal * 100) : 0,
            'users_total' => $usersTotal,
            'users_active' => $usersActive,
            'users_active_pct' => $usersTotal > 0 ? round($usersActive / $usersTotal * 100) : 0,
            'branch_admins' => $branchAdmins,
            'branch_admins_pct' => $usersTotal > 0 ? round($branchAdmins / $usersTotal * 100) : 0,
            'collectors' => $collectors,
            'collectors_pct' => $usersTotal > 0 ? round($collectors / $usersTotal * 100) : 0,
        ];

        $hour = now()->hour;
        $greeting = match (true) {
            $hour < 12 => __('Good morning'),
            $hour < 18 => __('Good afternoon'),
            default => __('Good evening'),
        };

        return view('dashboard', [
            'greeting' => $greeting,
            'stats' => $stats,
            'recentBranches' => $branches->take(5),
            'recentUsers' => $users->take(5),
            'scopedToBranch' => $scopedToBranch,
        ]);
    }
}
