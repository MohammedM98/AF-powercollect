<?php

namespace App\Http\Controllers;

use App\Enums\UserRole;
use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Models\Branch;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class UserController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(): InertiaResponse
    {
        $this->authorize('viewAny', User::class);

        $actor = auth()->user();

        $users = User::query()
            ->when(! $actor->isSuperAdmin(), fn ($query) => $query->where('branch_id', $actor->branch_id))
            ->with('branch')
            ->orderBy('name')
            ->paginate(15)
            ->through(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'username' => $user->username,
                'roleLabel' => __($user->role->label()),
                'branchName' => $user->branch?->name,
                'is_active' => $user->is_active,
                'canUpdate' => $actor->can('update', $user),
            ]);

        return Inertia::render('Users/Index', [
            'users' => $users,
            'canCreate' => $actor->can('create', User::class),
            'status' => session('status'),
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create(): InertiaResponse
    {
        $this->authorize('create', User::class);

        $actor = auth()->user();
        $canChooseBranch = $actor->isSuperAdmin();
        $branches = $canChooseBranch ? Branch::orderBy('name')->get() : collect();
        $roleOptions = $actor->isSuperAdmin()
            ? [UserRole::BranchAdmin, ...UserRole::staffRoles()]
            : UserRole::staffRoles();

        return Inertia::render('Users/Create', [
            'branches' => $branches,
            'canChooseBranch' => $canChooseBranch,
            'roleOptions' => collect($roleOptions)->map(fn (UserRole $role) => [
                'value' => $role->value,
                'label' => __($role->label()),
            ]),
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(StoreUserRequest $request): RedirectResponse
    {
        $actor = auth()->user();
        $data = $request->validated();

        // A Branch Admin may choose the new user's role (among the staff
        // roles), but never their branch — force it regardless of what the
        // request contains.
        if ($actor->isBranchAdmin()) {
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

        $actor = auth()->user();
        $canChooseBranch = $actor->isSuperAdmin();
        $branches = $canChooseBranch ? Branch::orderBy('name')->get() : collect();
        $roleOptions = match (true) {
            $actor->isSuperAdmin() && ! $user->isSuperAdmin() => [UserRole::BranchAdmin, ...UserRole::staffRoles()],
            $actor->isSuperAdmin() => [],
            default => UserRole::staffRoles(),
        };

        return Inertia::render('Users/Edit', [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'username' => $user->username,
                'role' => $user->role->value,
                'branch_id' => $user->branch_id,
                'is_active' => $user->is_active,
            ],
            'branches' => $branches,
            'canChooseBranch' => $canChooseBranch,
            'roleOptions' => collect($roleOptions)->map(fn (UserRole $role) => [
                'value' => $role->value,
                'label' => __($role->label()),
            ]),
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
}
