<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureFinancialAuditorAccess
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->isFinancialAuditor()) {
            if ($request->routeIs('dashboard')) {
                return redirect()->route('payments.cash-boxes', ['place' => 'closed']);
            }
            abort_unless($request->is('confirm-password') || $request->routeIs(
                'payments.cash-boxes', 'payments.cash-boxes.report', 'payments.bank-audits.store', 'payments.box-audits.store', 'payments.period-audits.store',
                'subscriptions.index', 'subscriptions.statement', 'subscriptions.personal-details.history', 'ledger.index', 'transaction-audit.index',
                'subscriptions.payments.receipt', 'profile.edit', 'profile.update', 'profile.devices.destroy',
                'password.confirm', 'password.update', 'logout', 'notifications.*',
            ), 403);
        }

        return $next($request);
    }
}
