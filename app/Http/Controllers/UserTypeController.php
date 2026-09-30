<?php

namespace App\Http\Controllers;

use App\Http\Concerns\DeletesRecords;
use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\StoreUserTypeRequest;
use App\Http\Requests\UpdateUserTypeRequest;
use App\Models\UserType;
use App\Notifications\ActionCompleted;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class UserTypeController extends Controller
{
    use DeletesRecords, FiltersDataTable;

    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', UserType::class);

        $actor = $request->user();
        $query = UserType::query();
        $this->applyDataTableFilters($query, $request, ['name'], ['name'], 'name');

        $types = $query->paginate($this->dataTablePerPage($request))->withQueryString()
            ->through(fn (UserType $userType): array => [
                'id' => $userType->id,
                'name' => $userType->name,
                'canUpdate' => $actor->can('update', $userType),
                'canDelete' => $actor->can('delete', $userType),
            ]);

        return Inertia::render('UserTypes/Index', [
            'userTypes' => $types,
            'canCreate' => $actor->can('create', UserType::class),
            'filters' => $this->dataTableState($request, 'name'),
        ]);
    }

    public function create(): InertiaResponse
    {
        $this->authorize('create', UserType::class);

        return Inertia::render('UserTypes/Create');
    }

    public function store(StoreUserTypeRequest $request): RedirectResponse
    {
        $userType = UserType::create($request->validated());
        $request->user()->notify(new ActionCompleted('user-type-created', $userType->name));

        return redirect()->route('user-types.index')->with('status', 'user-type-created');
    }

    public function edit(UserType $userType): InertiaResponse
    {
        $this->authorize('update', $userType);

        return Inertia::render('UserTypes/Edit', ['userType' => $userType->only(['id', 'name'])]);
    }

    public function update(UpdateUserTypeRequest $request, UserType $userType): RedirectResponse
    {
        $userType->update($request->validated());
        $request->user()->notify(new ActionCompleted('user-type-updated', $userType->name));

        return redirect()->route('user-types.index')->with('status', 'user-type-updated');
    }

    public function destroy(Request $request, UserType $userType): RedirectResponse
    {
        return $this->deleteRecord($request, $userType, 'user-type-deleted', $userType->name);
    }
}
