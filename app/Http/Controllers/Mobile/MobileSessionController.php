<?php

namespace App\Http\Controllers\Mobile;

use App\Enums\PermissionKey;
use App\Http\Controllers\Controller;
use App\Models\MeterReading;
use App\Models\MobileAccessToken;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

class MobileSessionController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $rateLimitKey = Str::transliterate(Str::lower($validated['username']).'|'.$request->ip());

        if (RateLimiter::tooManyAttempts($rateLimitKey, 5)) {
            return response()->json(['message' => trans('auth.throttle', [
                'seconds' => RateLimiter::availableIn($rateLimitKey),
                'minutes' => ceil(RateLimiter::availableIn($rateLimitKey) / 60),
            ])], 429);
        }

        $user = User::query()->where('username', $validated['username'])->first();

        if (! $user || ! $user->is_active || ! Hash::check($validated['password'], $user->password)) {
            RateLimiter::hit($rateLimitKey);

            return response()->json(['message' => trans('auth.failed')], 422);
        }

        RateLimiter::clear($rateLimitKey);

        return response()->json([
            'user' => $this->userData($user),
            'token' => MobileAccessToken::issue($user),
        ]);
    }

    public function show(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->userData($request->user())]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $request->attributes->get('mobile_access_token')->delete();

        return response()->json(['message' => 'Logged out.']);
    }

    /**
     * @return array{id: int, name: string, username: string, branch_name: ?string, can_record_readings: bool, can_record_collections: bool, can_view_readings: bool}
     */
    private function userData(User $user): array
    {
        $user->loadMissing('branch');

        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'branch_name' => $user->branch?->name,
            'can_record_readings' => $user->hasPermission(PermissionKey::RecordMeterReadings),
            'can_view_readings' => $user->can('viewAny', MeterReading::class),
            'can_record_collections' => $user->hasPermission(PermissionKey::RecordCollections),
        ];
    }
}
