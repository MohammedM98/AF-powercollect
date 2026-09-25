<?php

namespace App\Http\Controllers;

use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Http\Concerns\FiltersDataTable;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
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
     * Branch Admin, or a Super Admin — and only the permissions for their
     * branch's own data: the company-wide ones are left out entirely.
     */
    public function edit(Request $request): InertiaResponse
    {
        $this->authorize('manage', Permission::class);

        $actor = $request->user();
        $grantablePermissionIds = $this->grantablePermissionIds($actor);

        $query = $this->manageableUsers($actor)->with(['branch', 'permissions']);
        $this->applyDataTableFilters($query, $request, ['name', 'username'], self::SORTABLE, 'name');
        $this->applyDataTableFilterSelects($query, $request, ['role', 'branch_id']);

        $users = $query->paginate($this->dataTablePerPage($request))
            ->withQueryString()
            ->through(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'username' => $user->username,
                'roleLabel' => __($user->role->label()),
                'branchName' => $user->branch?->name,
                'permissionIds' => array_values(array_intersect($user->permissions->modelKeys(), $grantablePermissionIds)),
            ]);

        return Inertia::render('Settings/Permissions', [
            'users' => $users,
            'permissionGroups' => $this->permissionGroups($actor),
            'scopedToOwnBranch' => ! $actor->isSuperAdmin(),
            'filters' => $this->dataTableState($request, 'name'),
            'filterOptions' => $this->filterOptions($actor),
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
     *
     * Likewise only the permissions the actor may grant are changed. A
     * Branch Admin's save ignores company-wide permissions in the payload
     * and keeps any the Super Admin already gave that user.
     */
    public function update(Request $request): RedirectResponse
    {
        $this->authorize('manage', Permission::class);

        $actor = $request->user();
        $grantablePermissionIds = $this->grantablePermissionIds($actor);
        $payload = (array) $request->input('permissions', []);

        $users = $this->manageableUsers($actor)->with('permissions')->whereIn('id', array_keys($payload))->get();

        foreach ($users as $user) {
            $selected = array_intersect((array) ($payload[$user->id] ?? []), $grantablePermissionIds);
            $keptAsTheyWere = array_diff($user->permissions->modelKeys(), $grantablePermissionIds);
            $user->permissions()->sync([...$selected, ...$keptAsTheyWere]);
        }

        return redirect()->route('settings.permissions.edit')->with('status', 'permissions-updated');
    }

    /**
     * The users whose permissions the actor may manage: every non-Super-
     * Admin for a Super Admin; for anyone else, only the staff roles in
     * their own branch.
     *
     * @return Builder<User>
     */
    private function manageableUsers(User $actor): Builder
    {
        return User::query()
            ->where('role', '!=', UserRole::SuperAdmin)
            ->when(! $actor->isSuperAdmin(), fn (Builder $query) => $query
                ->where('branch_id', $actor->branch_id)
                ->whereIn('role', UserRole::staffRoles()));
    }

    /**
     * Whether the actor may hand out this permission: a Super Admin may
     * grant anything; a Branch Admin only permissions for their own
     * branch's data, never company-wide ones.
     */
    private function canGrant(User $actor, PermissionKey $permissionKey): bool
    {
        return $actor->isSuperAdmin() || ! $permissionKey->isCompanyWide();
    }

    /**
     * The ids of every permission the actor may grant or revoke.
     *
     * @return array<int, int>
     */
    private function grantablePermissionIds(User $actor): array
    {
        return Permission::all()
            ->filter(function (Permission $permission) use ($actor) {
                $permissionKey = PermissionKey::tryFrom($permission->key);

                return $actor->isSuperAdmin() || ($permissionKey !== null && $this->canGrant($actor, $permissionKey));
            })
            ->modelKeys();
    }

    /**
     * The permissions the actor may grant, grouped by resource, in the shape
     * the Permissions matrix renders: a resource label plus its ordered
     * action columns (view/create/update, or view/record/confirm for
     * Collections). A missing action (e.g. Collections has no "create")
     * comes back as null so the page can render an empty cell instead of a
     * checkbox. A resource with nothing the actor may grant is left out.
     *
     * @return array<int, array{key: string, label: string, actions: array<int, array{action: string, permission: array{id: int, label: string}|null}>}>
     */
    private function permissionGroups(User $actor): array
    {
        $permissionsByKey = Permission::all()->keyBy('key');

        return collect(PermissionKey::resourceGroups())
            ->map(fn (array $group) => [
                ...$group,
                'actions' => array_filter($group['actions'], fn (PermissionKey $permissionKey) => $this->canGrant($actor, $permissionKey)),
            ])
            ->filter(fn (array $group) => $group['actions'] !== [])
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

    /**
     * The Filter menu's dropdown groups for the index page. The branch
     * filter only makes sense for a Super Admin — a Branch Admin's list is
     * already scoped to their own single branch.
     *
     * @return array<int, array{key: string, label: string, options: array<int, array{value: string, label: string}>}>
     */
    private function filterOptions(User $actor): array
    {
        $roles = $actor->isSuperAdmin() ? UserRole::assignableBySuperAdmin() : UserRole::staffRoles();

        $groups = [
            $this->filterGroup('role', 'الدور', UserRole::options($roles)),
        ];

        if ($actor->isSuperAdmin()) {
            $groups[] = $this->branchFilterGroup();
        }

        return $groups;
    }
}
