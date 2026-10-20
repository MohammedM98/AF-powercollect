<?php

namespace App\Http\Controllers;

use App\Enums\AuditAction;
use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\UpdatePermissionsRequest;
use App\Models\Branch;
use App\Models\Permission;
use App\Models\User;
use App\Models\UserType;
use App\Notifications\ActionCompleted;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class PermissionController extends Controller
{
    use FiltersDataTable;

    private const SORTABLE = ['name', 'username'];

    /**
     * The employees whose permissions the actor may manage, beside the
     * permissions of the selected one (?selected=<id>, or the first one
     * listed). Super Admins already hold every permission implicitly and
     * are never listed.
     *
     * A Branch Admin sees only their own branch's staff (Collector, Data
     * Entry, Accountant) — never another branch's users, another
     * Branch Admin, or a Super Admin — and only the permissions they may
     * grant: never the company-wide ones.
     */
    public function edit(Request $request): InertiaResponse
    {
        $this->authorize('manage', Permission::class);

        $actor = $request->user();
        $grantablePermissionIds = $this->grantablePermissionIds($actor);

        $query = $this->manageableUsers($actor)->with(['branch', 'permissions', 'userType', 'workBranches']);
        $this->applyDataTableFilters($query, $request, ['name', 'username'], self::SORTABLE, 'name');
        $this->applyDataTableFilterSelects($query, $request, ['user_type_id', 'branch_id']);

        $users = $query->paginate($this->dataTablePerPage($request))
            ->withQueryString()
            ->through(fn (User $user) => $this->employeeSummary($user, $grantablePermissionIds));

        $findManageable = fn (int $id) => $this->manageableUsers($actor)->with(['branch', 'permissions', 'userType', 'workBranches'])->find($id);
        $selectedUser = $findManageable($request->integer('selected')) ?? $findManageable($users->first()['id'] ?? 0);

        return Inertia::render('Settings/Permissions', [
            'users' => $users,
            'selectedUser' => $selectedUser ? $this->employeeSummary($selectedUser, $grantablePermissionIds) : null,
            'permissionGroups' => $this->permissionGroups($actor),
            'roleTemplates' => [],
            'workBranchOptions' => $actor->isSuperAdmin() ? Branch::orderBy('name')->get(['id', 'name']) : null,
            'scopedToOwnBranch' => ! $actor->isSuperAdmin(),
            'auditOptions' => $actor->isSuperAdmin() ? [
                'permissionId' => Permission::query()->where('key', PermissionKey::AuditClosings->value)->value('id'),
                'branches' => Branch::query()->orderBy('name')->get(['id', 'name']),
                'actions' => array_map(fn (AuditAction $action): array => ['value' => $action->value, 'label' => $action->label(), 'hint' => $action->description()], AuditAction::cases()),
            ] : null,
            'filters' => $this->dataTableState($request, 'name'),
            'filterOptions' => $this->filterOptions($actor),
        ]);
    }

    /**
     * Sync each submitted user's custom permission grants, then go back to
     * the page the save came from — same employee, search and filters.
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
    public function update(UpdatePermissionsRequest $request): RedirectResponse
    {
        $this->authorize('manage', Permission::class);

        $actor = $request->user();
        $grantablePermissionIds = $this->grantablePermissionIds($actor);
        $payload = $request->validated('permissions');

        $users = $this->manageableUsers($actor)->with('permissions')->whereIn('id', array_keys($payload))->get();

        DB::transaction(function () use ($users, $payload, $grantablePermissionIds, $request): void {
            foreach ($users as $user) {
                $selected = array_intersect((array) ($payload[$user->id] ?? []), $grantablePermissionIds);
                $keptAsTheyWere = array_diff($user->permissions->modelKeys(), $grantablePermissionIds);
                $user->permissions()->sync([...$selected, ...$keptAsTheyWere]);
                if ($request->user()->isSuperAdmin() && $request->has("work_branches.{$user->id}")) {
                    $user->workBranches()->sync($request->validated("work_branches.{$user->id}"));
                }
                if ($request->user()->isSuperAdmin() && $request->has("audit_settings.{$user->id}")) {
                    $settings = $request->validated("audit_settings.{$user->id}");
                    $settings['branch_ids'] = $settings['scope'] === 'all' ? [] : array_values(array_unique(array_map(intval(...), $settings['branch_ids'])));
                    $settings['actions'] = array_values(array_unique($settings['actions']));
                    $user->audit_settings = $settings;
                    $user->save();
                }
            }
        });

        $actor->notify(new ActionCompleted('permissions-updated', $users->pluck('name')->join('، ')));

        return redirect()
            ->back(fallback: route('settings.permissions.edit'))
            ->with('status', 'permissions-updated');
    }

    /**
     * How an employee appears in the list and above the editor, with the
     * permissions they hold that the actor may change — the ones the
     * editor shows, counts, and copies to another employee.
     *
     * @param  array<int, int>  $grantablePermissionIds
     * @return array{id: int, name: string, username: string, role: string, roleLabel: string, branchName: ?string, permissionIds: array<int, int>, lockedPermissions: array<int, string>}
     */
    private function employeeSummary(User $user, array $grantablePermissionIds): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'role' => $user->role->value,
            'roleLabel' => $user->userType?->name ?? 'غير محدد',
            'userTypeName' => $user->userType?->name,
            'branchName' => $user->branch?->name,
            'branchId' => $user->branch_id,
            'workBranchIds' => $user->workBranches->modelKeys(),
            'auditSettings' => $user->auditSettings(),
            'isActive' => $user->is_active,
            'permissionIds' => array_values(array_intersect($user->permissions->modelKeys(), $grantablePermissionIds)),
            'lockedPermissions' => $user->permissions
                ->reject(fn (Permission $permission): bool => PermissionKey::tryFrom($permission->key)?->isRetired() ?? false)
                ->reject(fn (Permission $permission): bool => in_array($permission->id, $grantablePermissionIds, true))
                ->map(fn (Permission $permission): string => __(PermissionKey::tryFrom($permission->key)?->label() ?? $permission->label))
                ->values()->all(),
        ];
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
                ->where('branch_id', $actor->workBranchId())
                ->whereDoesntHave('permissions', fn (Builder $permissions) => $permissions->whereIn('key', array_map(
                    fn (PermissionKey $key): string => $key->value,
                    [PermissionKey::ManagePermissions, PermissionKey::AuditClosings, PermissionKey::ManageBranchDomains],
                ))));
    }

    /**
     * Whether the actor may hand out this permission: a Super Admin may
     * grant anything; a Branch Admin only permissions they hold themselves,
     * and never company-wide ones.
     */
    private function canGrant(User $actor, PermissionKey $permissionKey): bool
    {
        return $actor->isSuperAdmin() || (! $permissionKey->isCompanyWide() && $actor->hasPermission($permissionKey));
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

                return $permissionKey !== null && ! $permissionKey->isRetired() && $this->canGrant($actor, $permissionKey);
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
        $groups = [
            $this->filterGroup('user_type_id', 'نوع المستخدم', UserType::query()->orderBy('name')->get()->map(fn (UserType $type): array => ['value' => (string) $type->id, 'label' => $type->name])->all()),
        ];

        if ($actor->isSuperAdmin()) {
            $groups[] = $this->branchFilterGroup();
        }

        return $groups;
    }
}
