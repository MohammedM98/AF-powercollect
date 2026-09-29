<?php

namespace App\Http\Middleware;

use App\Models\MobileAccessToken;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateMobileToken
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $plainTextToken = $request->bearerToken();
        $token = $plainTextToken
            ? MobileAccessToken::query()->with('user')->where('token_hash', hash('sha256', $plainTextToken))->first()
            : null;

        if (! $token || $token->expires_at->isPast() || ! $token->user?->is_active) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        Auth::setUser($token->user);
        $request->attributes->set('mobile_access_token', $token);
        $request->setUserResolver(fn () => $token->user);

        $token->forceFill(['last_used_at' => now()])->saveQuietly();

        return $next($request);
    }
}
