<?php

namespace App\Http\Controllers;

use App\Enums\UserRole;
use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Models\Branch;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class UserController extends Controller
{
    use FiltersDataTable;

    private const SORTABLE = ['name', 'username', 'role', 'is_active', 'created_at'];

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', User::class);

        $actor = auth()->user();

        $query = User::query()->visibleTo($actor)->with('branch');
        $this->applyDataTableFilters($query, $request, ['name', 'username'], self::SORTABLE, 'name');
        $this->applyDataTableFilterSelects($query, $request, ['role', 'is_active', 'branch_id']);

        $users = $query->paginate($this->dataTablePerPage($request))
            ->withQueryString()
            ->through(fn (User $user) => [
                ...$this->editableFields($user),
                'roleLabel' => __($user->role->label()),
                'branchName' => $user->branch?->name,
                'canUpdate' => $actor->can('update', $user),
            ]);

        return Inertia::render('Users/Index', [
            'users' => $users,
            'canCreate' => $actor->can('create', User::class),
            'filters' => $this->dataTableState($request, 'name'),
            'filterOptions' => $this->filterOptions($actor),
            'createRoleOptions' => $this->roleOptionsFor(null),
            ...$this->formOptions(),
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create(): InertiaResponse
    {
        $this->authorize('create', User::class);

        return Inertia::render('Users/Create', [
            ...$this->formOptions(),
            'roleOptions' => $this->roleOptionsFor(null),
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(StoreUserRequest $request): RedirectResponse
    {
        $actor = auth()->user();
        $data = $request->validated();

        // A Branch Admin or a grantee of the "Add Users" permission may
        // choose the new user's role (among the staff roles), but never
        // their branch — force it regardless of what the request contains.
        if (! $actor->isSuperAdmin()) {
            $data['branch_id'] = $actor->branch_id;
        }

        $data['password'] = Hash::make($data['password']);

        User::create($data);

        return redirect()->route('users.index')->with('status', 'user-created');
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(User $user): InertiaResponse
    {
        $this->authorize('update', $user);

        return Inertia::render('Users/Edit', [
            'user' => $this->editableFields($user),
            ...$this->formOptions(),
            'roleOptions' => $this->roleOptionsFor($user),
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(UpdateUserRequest $request, User $user): RedirectResponse
    {
        $data = $request->validated();

        if (! empty($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        } else {
            unset($data['password']);
        }

        $user->update($data);

        return redirect()->route('users.index')->with('status', 'user-updated');
    }

    /**
     * A user's editable fields — used both for the dedicated edit page and
     * for the edit modal's initial form data on the index page.
     *
     * @return array<string, mixed>
     */
    private function editableFields(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'role' => $user->role->value,
            'branch_id' => $user->branch_id,
            'is_active' => $user->is_active,
            'roleOptions' => $this->roleOptionsFor($user),
        ];
    }

    /**
     * The branch options for the create/edit forms, and whether the actor
     * may choose the branch themselves.
     *
     * @return array{branches: Collection, canChooseBranch: bool}
     */
    private function formOptions(): array
    {
        $actor = auth()->user();
        $canChooseBranch = $actor->isSuperAdmin();

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
    private function roleOptionsFor(?User $user): array
    {
        $actor = auth()->user();

        $roles = match (true) {
            ! $actor->isSuperAdmin() => UserRole::staffRoles(),
            $user?->isSuperAdmin() => [],
            default => UserRole::assignableBySuperAdmin(),
        };

        return UserRole::options($roles);
    }

    /**
     * The Filter menu's dropdown groups for the index page. The branch
     * filter only makes sense for a Super Admin — everyone else's list is
     * already scoped to their own single branch.
     *
     * @return array<int, array{key: string, label: string, options: array<int, array{value: string, label: string}>}>
     */
    private function filterOptions(User $actor): array
    {
        $groups = [
            $this->filterGroup('role', 'الدور', UserRole::options()),
            $this->activeStatusFilterGroup(),
        ];

        if ($actor->isSuperAdmin()) {
            $groups[] = $this->branchFilterGroup();
        }

        return $groups;
    }
}
