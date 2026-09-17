<?php

namespace App\Http\Controllers;

use App\Enums\UserRole;
use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Models\Branch;
use App\Models\User;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(): View
    {
        $this->authorize('viewAny', User::class);

        $actor = auth()->user();

        $users = User::query()
            ->when($actor->isBranchAdmin(), fn ($query) => $query->where('branch_id', $actor->branch_id))
            ->with('branch')
            ->orderBy('name')
            ->paginate(15);

        return view('users.index', compact('users'));
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create(): View
    {
        $this->authorize('create', User::class);

        $branches = auth()->user()->isSuperAdmin()
            ? Branch::orderBy('name')->get()
            : collect();

        return view('users.create', compact('branches'));
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(StoreUserRequest $request): RedirectResponse
    {
        $actor = auth()->user();
        $data = $request->validated();

        // Branch Admins may only ever create Collectors within their own
        // branch — force these regardless of what the request contains.
        if ($actor->isBranchAdmin()) {
            $data['role'] = UserRole::Collector->value;
            $data['branch_id'] = $actor->branch_id;
        }

        $data['password'] = Hash::make($data['password']);

        User::create($data);

        return redirect()->route('users.index')->with('status', 'user-created');
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(User $user): View
    {
        $this->authorize('update', $user);

        $branches = auth()->user()->isSuperAdmin()
            ? Branch::orderBy('name')->get()
            : collect();

        return view('users.edit', compact('user', 'branches'));
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
