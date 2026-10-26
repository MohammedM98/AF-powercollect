<?php

namespace App\Support;

use App\Models\Branch;
use Illuminate\Support\Collection;

/**
 * The branches a page's figures belong to, as the branch banner at the top
 * of the page names them: one branch with its place, phone and subscribers,
 * or every branch the user may see, counted.
 */
class BranchScope
{
    /**
     * @param  Collection<int, Branch>  $chosen
     * @return array{all: bool, name: string, place: ?string, phone: ?string, isActive: bool, branches: int, subscribers: int}
     */
    public static function describe(Collection $chosen): array
    {
        $branches = Branch::query()
            ->whereKey($chosen->pluck('id'))
            ->with(['governorate:id,name', 'area:id,name'])
            ->withCount('subscriptions')
            ->get();
        $all = $branches->count() > 1;
        $branch = $branches->first();

        return [
            'all' => $all,
            'name' => $all ? 'جميع الفروع' : ($branch?->name ?? ''),
            'place' => $all || ! $branch ? null : (collect([$branch->governorate?->name, $branch->area?->name])->filter()->implode(' · ') ?: $branch->location),
            'phone' => $all ? null : $branch?->phone,
            'isActive' => $all || (bool) $branch?->is_active,
            'branches' => $branches->count(),
            'subscribers' => (int) $branches->sum('subscriptions_count'),
        ];
    }
}
