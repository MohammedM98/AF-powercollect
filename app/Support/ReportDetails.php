<?php

namespace App\Support;

use App\Models\Branch;
use App\Models\CashBox;
use App\Models\CashBoxPayment;
use App\Models\Closing;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Collection;

class ReportDetails
{
    /** @param Collection<int, Branch> $branches */
    public function __construct(private Collection $branches, private CarbonImmutable $to) {}

    /** Historical balances use every signed line; payments settle the oldest charges first. @return array<string, mixed> */
    public function debts(string $search = '', string $age = ''): array
    {
        $rows = collect();
        $credit = 0;
        $creditCount = 0;
        foreach ($this->branches as $branch) {
            $periods = ClosingPeriods::for($branch);
            $end = $periods->dayEnd($this->to)->utc();
            Subscription::query()->where('branch_id', $branch->id)->orderBy('id')->chunkById(300, function (Collection $subscriptions) use (&$rows, &$credit, &$creditCount, $branch, $periods, $end): void {
                $lines = SubscriptionTransaction::query()->whereIn('subscription_id', $subscriptions->pluck('id')->all())
                    ->where('created_at', '<', $end)->orderByDesc('created_at')->orderByDesc('id')
                    ->get(['id', 'subscription_id', 'type', 'amount', 'created_at', 'cancelled_at', 'reverses_id'])->groupBy('subscription_id');
                foreach ($subscriptions as $subscription) {
                    $history = $lines->get($subscription->id, collect());
                    $balance = $history->sum(fn (SubscriptionTransaction $line): int => Closing::cents($line->amount));
                    if ($balance <= 0) {
                        $credit += $balance;
                        $creditCount += $balance < 0 ? 1 : 0;

                        continue;
                    }
                    $remaining = $balance;
                    $buckets = array_fill_keys(array_keys(DebtAging::BUCKETS), 0);
                    $oldestDays = 0;
                    $lastPayment = null;
                    foreach ($history as $line) {
                        $standing = $line->cancelled_at === null || $line->cancelled_at->greaterThanOrEqualTo($end);
                        if ($lastPayment === null && $standing && $line->type === SubscriptionTransaction::TYPE_PAYMENT) {
                            $lastPayment = $periods->dayOf($line->created_at);
                        }
                        if ($remaining <= 0 || ! $standing || $line->reverses_id !== null || in_array($line->type, SubscriptionTransaction::REVERSAL_TYPES, true) || Closing::cents($line->amount) <= 0) {
                            continue;
                        }
                        $day = $periods->dayOf($line->created_at);
                        $oldestDays = max(0, (int) ClosingPeriods::date($day)->diffInDays($this->to));
                        $taken = min($remaining, Closing::cents($line->amount));
                        $buckets[DebtAging::bucketFor($oldestDays)] += $taken;
                        $remaining -= $taken;
                    }
                    $buckets[DebtAging::bucketFor($oldestDays)] += $remaining;
                    $rows->push([
                        'id' => $subscription->id, 'name' => $subscription->displayName(), 'accountNumber' => $subscription->account_number,
                        'branchName' => $branch->name, 'balance' => Closing::money($balance),
                        'buckets' => array_map(fn (int $amount): string => Closing::money($amount), $buckets),
                        'oldestDays' => $oldestDays, 'lastPaymentDate' => $lastPayment,
                    ]);
                }
            });
        }
        $rows = $rows->filter(fn (array $row): bool => ($search === '' || mb_stripos($row['name'].' '.$row['accountNumber'], $search) !== false)
            && ($age === '' || Closing::cents($row['buckets'][$age]) > 0))->sortByDesc(fn (array $row): int => Closing::cents($row['balance']))->values();

        return [
            'rows' => $rows, 'asOf' => $this->to->toDateString(), 'count' => $rows->count(), 'bucketLabels' => DebtAging::BUCKET_LABELS,
            'total' => Closing::money($rows->sum(fn (array $row): int => Closing::cents($row['balance']))),
            'credit' => Closing::money($credit), 'creditCount' => $creditCount,
            'buckets' => collect(DebtAging::BUCKET_LABELS)->map(fn (string $label, string $key): array => ['key' => $key, 'label' => $label, 'total' => Closing::money($rows->sum(fn (array $row): int => Closing::cents($row['buckets'][$key])))])->values(),
        ];
    }

    /** Recorded box entries by currency, without treating a handover as fresh income. @return array<string, mixed> */
    public function boxes(): array
    {
        $rows = collect();
        foreach ($this->branches as $branch) {
            $end = ClosingPeriods::for($branch)->dayEnd($this->to)->utc();
            $boxes = CashBox::query()->where('branch_id', $branch->id)->where('opened_at', '<', $end)
                ->with(['user:id,name', 'payments' => function (HasMany $query) use ($end): void {
                    $query->where('occurred_at', '<', $end);
                }, 'payments.transaction:id,cancelled_at'])
                ->orderByDesc('opened_at')->orderByDesc('id')->get();
            foreach ($boxes as $box) {
                $payments = $box->payments->filter(fn (CashBoxPayment $entry): bool => $entry->transaction !== null && ($entry->transaction->cancelled_at === null || $entry->transaction->cancelled_at->greaterThanOrEqualTo($end)));
                $closed = $box->closed_at !== null && $box->closed_at->lessThan($end);
                $received = $box->received_at !== null && $box->received_at->lessThan($end);
                foreach ($payments->groupBy('currency') as $currency => $entries) {
                    $rows->push([
                        'id' => $box->id.'-'.$currency, 'boxId' => $box->id, 'number' => $box->number, 'collector' => $box->user?->name,
                        'branchName' => $branch->name, 'type' => __($box->type->label()), 'currency' => $currency, 'count' => $entries->count(),
                        'amount' => Closing::money($entries->sum(fn (CashBoxPayment $entry): int => Closing::cents($entry->amount))),
                        'status' => $received ? 'مستلم' : ($closed ? 'مغلق' : 'مفتوح'), 'openedAt' => DailySeries::localDate($box->opened_at),
                    ]);
                }
            }
        }

        return ['asOf' => $this->to->toDateString(), 'rows' => $rows->values()];
    }
}
