<?php

namespace App\Http\Middleware;

use App\Enums\AuditAction;
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
        $user = $request->user();
        if ($user && ($user->isFinancialAuditor() || $user->hasFinancialAuditAccess()) && ($request->routeIs('payments.cash-boxes.report', 'subscriptions.statement.print', 'subscriptions.payments.receipt') || ($request->boolean('print') && $request->routeIs('subscriptions.index', 'ledger.index', 'transaction-audit.index', 'payments.cash-boxes')))) {
            abort_unless($user->canAuditAction(AuditAction::PrintReports), 403);
        }
        if ($request->user()?->isFinancialAuditor()) {
            if ($request->routeIs('dashboard')) {
                abort_unless($user->hasFinancialAuditAccess(), 403);

                return redirect()->route('payments.cash-boxes', ['place' => 'closed']);
            }
            if ($request->routeIs('payments.*', 'subscriptions.*', 'ledger.index', 'transaction-audit.index')) {
                abort_unless($user->hasFinancialAuditAccess(), 403);
            }
            abort_unless($request->is('confirm-password') || $request->routeIs(
                'payments.cash-boxes', 'payments.cash-boxes.report', 'payments.bank-audits.store', 'payments.box-audits.store', 'payments.period-audits.store',
                'payments.split.show',
                'subscriptions.index', 'subscriptions.statement', 'subscriptions.statement.print', 'subscriptions.personal-details.history', 'ledger.index', 'transaction-audit.index',
                'subscriptions.payments.receipt', 'profile.edit', 'profile.update', 'profile.devices.destroy',
                'password.confirm', 'password.update', 'logout', 'notifications.*',
            ), 403);
        }

        return $next($request);
    }
}
