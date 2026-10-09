<?php

namespace App\Support;

use App\Models\SubscriptionTransaction;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * What each branch collected, charged and is still owed — the figures the
 * dashboard and the branch performance pages put beside each other. They
 * count the same way the financial log does: a payment that still stands is
 * "collected" and a charge that still stands is "charged", on the business
 * day (by the closing cut-off) it was recorded. Amounts are in shekels.
 */
class CollectionFigures
{
    /**
     * What each branch collected between two business days, inclusive: the
     * payments that still stand.
     *
     * @param  array<int, int>|null  $branchIds  null for every branch
     * @return array<int, float> branch id => shekels
     */
    public static function collected(CarbonInterface|string $first, CarbonInterface|string $last, ?array $branchIds = null): array
    {
        return self::perBranch(
            SubscriptionTransaction::query()->counted()->where('subscription_transactions.type', SubscriptionTransaction::TYPE_PAYMENT),
            $first,
            $last,
            $branchIds,
            -1,
        );
    }

    /**
     * What each branch charged between two business days, inclusive: the
     * readings, fees and penalties that still stand.
     *
     * @param  array<int, int>|null  $branchIds  null for every branch
     * @return array<int, float> branch id => shekels
     */
    public static function charged(CarbonInterface|string $first, CarbonInterface|string $last, ?array $branchIds = null): array
    {
        return self::perBranch(SubscriptionTransaction::query()->charges(), $first, $last, $branchIds, 1);
    }

    /**
     * What each branch's subscriptions owe it now: the sum of the balances
     * that are above zero, and how many subscriptions owe.
     *
     * @param  array<int, int>|null  $branchIds  null for every branch
     * @return array<int, array{amount: float, debtors: int}> branch id => figures
     */
    public static function outstanding(?array $branchIds = null): array
    {
        $balances = DB::table('subscription_transactions')
            ->select('subscription_id')
            ->selectRaw('sum(amount) as balance')
            ->groupBy('subscription_id')
            ->havingRaw('sum(amount) > 0.004');

        return DB::query()
            ->fromSub($balances, 'owed')
            ->join('subscriptions', 'subscriptions.id', '=', 'owed.subscription_id')
            ->when($branchIds !== null, fn ($query) => $query->whereIn('subscriptions.branch_id', $branchIds))
            ->groupBy('subscriptions.branch_id')
            ->selectRaw('subscriptions.branch_id, sum(owed.balance) as amount, count(*) as debtors')
            ->get()
            ->mapWithKeys(fn (object $row): array => [(int) $row->branch_id => [
                'amount' => round((float) $row->amount, 2),
                'debtors' => (int) $row->debtors,
            ]])
            ->all();
    }

    /**
     * The share of what was charged that was collected, as a whole
     * percentage, or null when nothing was charged. It can pass 100 when
     * the period's payments also settle older debts.
     */
    public static function rate(float $collected, float $charged): ?int
    {
        return $charged > 0 ? (int) round($collected / $charged * 100) : null;
    }

    /**
     * The query's lines of the period, summed per branch.
     *
     * @param  Builder<SubscriptionTransaction>  $lines
     * @param  array<int, int>|null  $branchIds
     * @param  int  $sign  1 to add the amounts up, -1 for payments, which are stored as negative amounts
     * @return array<int, float>
     */
    private static function perBranch(Builder $lines, CarbonInterface|string $first, CarbonInterface|string $last, ?array $branchIds, int $sign): array
    {
        [$start, $end] = ClosingPeriods::utcRange($first, $last);

        return $lines
            ->join('subscriptions', 'subscriptions.id', '=', 'subscription_transactions.subscription_id')
            ->where('subscription_transactions.created_at', '>=', $start)
            ->where('subscription_transactions.created_at', '<', $end)
            ->when($branchIds !== null, fn (Builder $query) => $query->whereIn('subscriptions.branch_id', $branchIds))
            ->toBase()
            ->groupBy('subscriptions.branch_id')
            ->selectRaw('subscriptions.branch_id, sum(subscription_transactions.amount) as total')
            ->pluck('total', 'branch_id')
            ->mapWithKeys(fn (mixed $total, int|string $branchId): array => [(int) $branchId => round($sign * (float) $total, 2)])
            ->all();
    }
}
