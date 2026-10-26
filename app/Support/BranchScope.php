<?php

namespace App\Support;

use App\Models\Branch;
use Illuminate\Support\Collection;

/**
 * The branches a page's figures belong to, as the branch banner at the top
 * of the page names them: one branch with its place, phone and subscribers,
 * a governorate's branches (when the page was narrowed to one), or every
 * branch the user may see, counted.
 */
class BranchScope
{
    /**
     * @param  Collection<int, Branch>  $chosen
     * @param  string|null  $governorate  the governorate's name, when the page was narrowed to one rather than to a branch
     * @return array{level: string, all: bool, name: string, place: ?string, phone: ?string, isActive: bool, branches: int, subscribers: int}
     */
    public static function describe(Collection $chosen, ?string $governorate = null): array
    {
        $branches = Branch::query()
            ->whereKey($chosen->pluck('id'))
            ->with(['governorate:id,name', 'area:id,name'])
            ->withCount('subscriptions')
            ->get();
        $level = $governorate !== null ? 'governorate' : ($branches->count() > 1 ? 'all' : 'branch');
        $branch = $level === 'branch' ? $branches->first() : null;

        return [
            'level' => $level,
            'all' => $level !== 'branch',
            'name' => match ($level) {
                'governorate' => $governorate,
                'all' => 'جميع الفروع',
                default => $branch?->name ?? '',
            },
            'place' => $branch ? (collect([$branch->governorate?->name, $branch->area?->name])->filter()->implode(' · ') ?: $branch->location) : null,
            'phone' => $branch?->phone,
            'isActive' => $branch === null || (bool) $branch->is_active,
            'branches' => $branches->count(),
            'subscribers' => (int) $branches->sum('subscriptions_count'),
        ];
    }
}
