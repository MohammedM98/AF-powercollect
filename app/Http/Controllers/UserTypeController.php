<?php

namespace App\Http\Controllers;

use App\Http\Concerns\DeletesRecords;
use App\Http\Requests\StoreUserTypeRequest;
use App\Http\Requests\UpdateUserTypeRequest;
use App\Models\UserType;
use App\Notifications\ActionCompleted;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * User types are managed on the Users page's types tab; this controller
 * saves them and sends the user back there.
 */
class UserTypeController extends Controller
{
    use DeletesRecords;

    public function index(): RedirectResponse
    {
        $this->authorize('viewAny', UserType::class);

        return redirect()->route('users.index', ['tab' => 'types']);
    }

    public function store(StoreUserTypeRequest $request): RedirectResponse
    {
        $userType = UserType::create($request->validated());
        $request->user()->notify(new ActionCompleted('user-type-created', $userType->name));

        return redirect()->route('users.index', ['tab' => 'types'])->with('status', 'user-type-created');
    }

    public function update(UpdateUserTypeRequest $request, UserType $userType): RedirectResponse
    {
        $userType->update($request->validated());
        $request->user()->notify(new ActionCompleted('user-type-updated', $userType->name));

        return redirect()->route('users.index', ['tab' => 'types'])->with('status', 'user-type-updated');
    }

    public function destroy(Request $request, UserType $userType): RedirectResponse
    {
        return $this->deleteRecord($request, $userType, 'user-type-deleted', $userType->name);
    }
}
