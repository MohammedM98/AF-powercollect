<?php

namespace App\Http\Controllers;

use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Http\Concerns\FiltersDataTable;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class PermissionController extends Controller
{
    use FiltersDataTable;

    private const SORTABLE = ['name', 'username'];

    /**
     * Show the permission grants for every non-Super-Admin user. Super
     * Admins already hold every permission implicitly and are excluded.
     *
     * A Branch Admin sees only their own branch's staff (Collector, Data
     * Entry, Financial Auditor) — never another branch's users, another
     * Branch Admin, or a Super Admin.
     */
    public function edit(Request $request): InertiaResponse
    {
        $this->authorize('manage', Permission::class);

        $actor = $request->user();

        $query = User::where('role', '!=', UserRole::SuperAdmin)
            ->when(! $actor->isSuperAdmin(), fn ($q) => $q->where('branch_id', $actor->branch_id)->whereIn('role', UserRole::staffRoles()))
            ->with(['branch', 'permissions']);
        $this->applyDataTableFilters($query, $request, ['name', 'username'], self::SORTABLE, 'name');
        $this->applyDataTableFilterSelects($query, $request, ['role']);

        $users = $query->paginate($this->dataTablePerPage($request))
            ->withQueryString()
            ->through(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'username' => $user->username,
                'roleLabel' => __($user->role->label()),
                'branchName' => $user->branch?->name,
                'permissionIds' => $user->permissions->pluck('id'),
            ]);

        return Inertia::render('Settings/Permissions', [
            'users' => $users,
            'permissionGroups' => $this->permissionGroups(),
            'scopedToOwnBranch' => ! $actor->isSuperAdmin(),
            'status' => session('status'),
            'filters' => $this->dataTableState($request, 'name'),
            'filterOptions' => [
                [
                    'key' => 'role',
                    'label' => 'الدور',
                    'options' => collect($actor->isSuperAdmin() ? UserRole::cases() : UserRole::staffRoles())
                        ->reject(fn (UserRole $role) => $role === UserRole::SuperAdmin)
                        ->map(fn (UserRole $role) => ['value' => $role->value, 'label' => __($role->label())])
                        ->values()
                        ->all(),
                ],
            ],
        ]);
    }

    /**
     * Sync each submitted user's custom permission grants from the matrix.
     *
     * Only users actually present in the payload are touched — the list is
     * paginated/searchable, so a save only ever carries the users visible
     * on screen at the time. Looping over every user in the table instead
     * would silently wipe the grants of anyone on another page.
     *
     * The same branch/role scoping as edit() is re-applied here, not just
     * trusted from the page: without it, a Branch Admin could craft a
     * payload naming a user outside their branch (or another Branch Admin)
     * and edit permissions they have no business touching.
     */
    public function update(Request $request): RedirectResponse
    {
        $this->authorize('manage', Permission::class);

        $actor = $request->user();
        $validPermissionIds = Permission::pluck('id')->all();
        $payload = (array) $request->input('permissions', []);

        $userIds = User::where('role', '!=', UserRole::SuperAdmin)
            ->when(! $actor->isSuperAdmin(), fn ($q) => $q->where('branch_id', $actor->branch_id)->whereIn('role', UserRole::staffRoles()))
            ->whereIn('id', array_keys($payload))
            ->pluck('id');

        $users = User::whereIn('id', $userIds)->get()->keyBy('id');

        foreach ($userIds as $userId) {
            $selected = (array) ($payload[$userId] ?? []);
            $users[$userId]->permissions()->sync(array_intersect($selected, $validPermissionIds));
        }

        return redirect()->route('settings.permissions.edit')->with('status', 'permissions-updated');
    }

    /**
     * Every permission, grouped by resource, in the shape the Permissions
     * matrix renders: a resource label plus its ordered action columns
     * (view/create/update, or view/record/confirm for Collections). A
     * missing action (e.g. Users has no grantable "create") comes back as
     * null so the page can render an empty cell instead of a checkbox.
     *
     * @return array<int, array{key: string, label: string, actions: array<int, array{action: string, permission: array{id: int, label: string}|null}>}>
     */
    private function permissionGroups(): array
    {
        $permissionsByKey = Permission::all()->keyBy('key');

        return collect(PermissionKey::resourceGroups())
            ->map(function (array $group, string $resourceKey) use ($permissionsByKey) {
                return [
                    'key' => $resourceKey,
                    'label' => __($group['label']),
                    'actions' => collect($group['actions'])
                        ->map(function (PermissionKey $permissionKey, string $action) use ($permissionsByKey) {
                            $permission = $permissionsByKey->get($permissionKey->value);

                            return [
                                'action' => $action,
                                'permission' => $permission ? ['id' => $permission->id, 'label' => __($permissionKey->label())] : null,
                            ];
                        })
                        ->values()
                        ->all(),
                ];
            })
            ->values()
            ->all();
    }
}
