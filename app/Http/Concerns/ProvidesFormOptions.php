<?php

namespace App\Http\Concerns;

use App\Enums\UserRole;
use App\Models\Area;
use App\Models\Branch;
use App\Models\Governorate;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * The dropdown options the branch and user forms need, shared by their own
 * pages and by the dashboard's quick "new …" buttons.
 */
trait ProvidesFormOptions
{
    /**
     * The governorates and areas a branch can be placed in. Areas are sent
     * unfiltered (each carrying its governorate_id) so the form can narrow
     * the area choices client-side once a governorate is picked.
     *
     * @return array{governorates: Collection, areas: Collection}
     */
    protected function branchFormOptions(): array
    {
        return [
            'governorates' => Governorate::orderBy('name')->get(),
            'areas' => Area::with('governorate')->orderBy('name')->get(),
        ];
    }

    /**
     * The branch options for the user forms, and whether the actor may
     * choose the branch themselves.
     *
     * @return array{branches: Collection, canChooseBranch: bool}
     */
    protected function userBranchOptions(): array
    {
        $canChooseBranch = auth()->user()->isSuperAdmin();

        return [
            'branches' => $canChooseBranch ? Branch::orderBy('name')->get() : collect(),
            'canChooseBranch' => $canChooseBranch,
        ];
    }

    /**
     * The roles the current actor may assign, given the user being edited
     * (or null when creating a new user). A Super Admin's own role can't
     * be changed, so editing one offers no roles at all.
     *
     * @return array<int, array{value: string, label: string}>
     */
    protected function userRoleOptions(?User $user): array
    {
        $roles = match (true) {
            ! auth()->user()->isSuperAdmin() => UserRole::staffRoles(),
            $user?->isSuperAdmin() => [],
            default => UserRole::assignableBySuperAdmin(),
        };

        return UserRole::options($roles);
    }
}
