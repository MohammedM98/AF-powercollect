<?php

namespace App\Http\Controllers;

use App\Enums\PermissionKey;
use App\Http\Requests\ProfileUpdateRequest;
use App\Notifications\ActionCompleted;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Redirect;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class ProfileController extends Controller
{
    /**
     * Display the user's profile form.
     */
    public function edit(Request $request): InertiaResponse
    {
        $user = $request->user()->loadMissing(['branch', 'permissions']);
        $devices = ProfileDeviceController::devices($request);

        return Inertia::render('Profile/Edit', [
            'user' => [
                'name' => $user->name,
                'username' => $user->username,
                'roleLabel' => __($user->role->label()),
                'branchName' => $user->isSuperAdmin() ? 'جميع الفروع' : ($user->branch?->name ?? 'لم يُحدد فرع'),
                'isActive' => $user->is_active,
                'memberSince' => $user->created_at->timezone(config('app.business_timezone'))->format('d/m/Y'),
                'lastActiveAt' => collect($devices)->pluck('lastActiveAt')->filter()->max(),
                'weeklyActions' => $user->notifications()->where('type', ActionCompleted::class)
                    ->where('data->action', '!=', 'meter-reading-needs-reapproval')
                    ->where('created_at', '>=', now(config('app.business_timezone'))->startOfWeek()->utc())->count(),
            ],
            'permissionGroups' => collect(PermissionKey::resourceGroups())->map(fn (array $group, string $key) => [
                'key' => $key,
                'label' => __($group['label']),
                'permissions' => collect($group['actions'])->map(fn (PermissionKey $key) => [
                    'key' => $key->value,
                    'label' => __($key->label()),
                    'granted' => $user->hasPermission($key),
                ])->values()->all(),
            ])->values()->all(),
            'devices' => $devices,
            'businessTimezone' => config('app.business_timezone'),
        ]);
    }

    /**
     * Update the user's profile information.
     */
    public function update(ProfileUpdateRequest $request): RedirectResponse
    {
        $request->user()->fill($request->validated());
        $request->user()->save();
        $request->user()->notify(new ActionCompleted('profile-updated'));

        return Redirect::route('profile.edit')->with('status', 'profile-updated');
    }

    /**
     * Delete the user's account.
     */
    public function destroy(Request $request): RedirectResponse
    {
        $request->validateWithBag('userDeletion', [
            'password' => ['required', 'current_password'],
        ]);

        $user = $request->user();

        Auth::logout();

        $user->delete();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return Redirect::to('/');
    }
}
