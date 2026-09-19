<?php

namespace App\Http\Controllers;

use App\Enums\UserRole;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class PermissionController extends Controller
{
    /**
     * Show the permission grants for every non-Super-Admin user. Super
     * Admins already hold every permission implicitly and are excluded.
     *
     * Rendered with Inertia + React, alongside the Branches list — see
     * BranchController for the first trial and its notes.
     */
    public function edit(): InertiaResponse
    {
        $this->authorize('manage', Permission::class);

        $users = User::where('role', '!=', UserRole::SuperAdmin)
            ->with(['branch', 'permissions'])
            ->orderBy('name')
            ->get();

        $permissions = Permission::orderBy('label')->get();

        return Inertia::render('Settings/Permissions', [
            'users' => $users->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'username' => $user->username,
                'roleLabel' => __($user->role->label()),
                'branchName' => $user->branch?->name,
                'permissionIds' => $user->permissions->pluck('id'),
            ]),
            'permissions' => $permissions->map(fn (Permission $permission) => [
                'id' => $permission->id,
                'label' => __($permission->label),
            ]),
            'status' => session('status'),
        ]);
    }

    /**
     * Sync each user's custom permission grants from the submitted matrix.
     *
     * Every editable user is re-synced explicitly (including to an empty
     * set) rather than trusting only the checkboxes present in the request,
     * since an unchecked checkbox simply doesn't submit at all.
     */
    public function update(Request $request): RedirectResponse
    {
        $this->authorize('manage', Permission::class);

        $users = User::where('role', '!=', UserRole::SuperAdmin)->get();
        $validPermissionIds = Permission::pluck('id')->all();

        foreach ($users as $user) {
            $selected = (array) $request->input("permissions.{$user->id}", []);
            $user->permissions()->sync(array_intersect($selected, $validPermissionIds));
        }

        return redirect()->route('settings.permissions.edit')->with('status', 'permissions-updated');
    }
}
