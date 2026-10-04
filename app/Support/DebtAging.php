<?php

namespace App\Support;

use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * How old each subscriber's debt is (أعمار الديون). Payments, discounts and
 * clearings settle the oldest charges first, so what a subscriber still
 * owes is their newest charges, adding up to their balance. Each part of
 * it is aged by the business-time day its charge was made, into the
 * buckets below.
 *
 * Cancelled lines and their reversals cancel each other out and are never
 * aged; the balance itself always counts every line, so a part refunded
 * from a payment comes back as debt on the charges it had paid. Any of the
 * balance that no charge accounts for is aged with the oldest charge.
 */
class DebtAging
{
    /**
     * The age buckets, each with the most days old a debt in it may be
     * (null: no limit), youngest first.
     *
     * @var array<string, int|null>
     */
    public const BUCKETS = ['current' => 30, 'days_60' => 60, 'days_90' => 90, 'older' => null];

    /**
     * Each bucket's name, as the report's columns and filters read.
     *
     * @var array<string, string>
     */
    public const BUCKET_LABELS = [
        'current' => 'حتى 30 يومًا',
        'days_60' => '31–60 يومًا',
        'days_90' => '61–90 يومًا',
        'older' => 'أكثر من 90 يومًا',
    ];

    /**
     * Subscribers are aged this many at a time, to keep each query's list
     * of ids short.
     */
    private const CHUNK = 500;

    public function __construct(private CarbonImmutable $today) {}

    /**
     * Every subscriber the query finds who owes money (a balance above
     * zero), with their debt split by age, the day of the oldest charge
     * still unpaid, and the day of their last payment.
     *
     * @param  Builder<Subscriber>  $subscribers
     * @return Collection<int, array{subscriber: Subscriber, balance: int, buckets: array<string, int>, oldestDate: ?string, oldestDays: int, lastPaymentDate: ?string, lastPaymentDays: ?int}>
     */
    public function debtors(Builder $subscribers): Collection
    {
        $balance = '(select coalesce(sum(owed.amount), 0) from subscriber_transactions as owed where owed.subscriber_id = subscribers.id)';

        $debtors = $subscribers
            ->select('subscribers.*')
            ->selectRaw("{$balance} as balance")
            ->whereRaw("{$balance} > 0.004")
            ->get();

        return $debtors
            ->chunk(self::CHUNK)
            ->flatMap(function (Collection $chunk): array {
                $ids = $chunk->modelKeys();
                $charges = $this->chargesNewestFirst($ids);
                $lastPayments = $this->lastPayments($ids);

                return $chunk
                    ->map(fn (Subscriber $subscriber): array => $this->age($subscriber, $charges->get($subscriber->id, collect()), $lastPayments[$subscriber->id] ?? null))
                    ->all();
            })
            ->values();
    }

    /**
     * The bucket a debt this many days old falls in.
     */
    public static function bucketFor(int $days): string
    {
        foreach (self::BUCKETS as $bucket => $maxDays) {
            if ($maxDays === null || $days <= $maxDays) {
                return $bucket;
            }
        }

        return array_key_last(self::BUCKETS);
    }

    /**
     * One debtor's balance split over the charges that make it up, newest
     * first.
     *
     * @param  Collection<int, object{created_at: string, amount: string}>  $charges  newest first
     * @return array{subscriber: Subscriber, balance: int, buckets: array<string, int>, oldestDate: ?string, oldestDays: int, lastPaymentDate: ?string, lastPaymentDays: ?int}
     */
    private function age(Subscriber $subscriber, Collection $charges, ?string $lastPaidAt): array
    {
        $balance = self::cents((string) $subscriber->balance);
        $remaining = $balance;
        $buckets = array_fill_keys(array_keys(self::BUCKETS), 0);
        $oldestDate = null;
        $oldestDays = 0;

        foreach ($charges as $charge) {
            if ($remaining <= 0) {
                break;
            }

            $taken = min($remaining, self::cents($charge->amount));
            $oldestDate = DailySeries::localDate($charge->created_at);
            $oldestDays = $this->daysSince($oldestDate);
            $buckets[self::bucketFor($oldestDays)] += $taken;
            $remaining -= $taken;
        }

        if ($remaining > 0) {
            $buckets[self::bucketFor($oldestDays)] += $remaining;
        }

        $lastPaymentDate = $lastPaidAt ? DailySeries::localDate($lastPaidAt) : null;

        return [
            'subscriber' => $subscriber,
            'balance' => $balance,
            'buckets' => $buckets,
            'oldestDate' => $oldestDate,
            'oldestDays' => $oldestDays,
            'lastPaymentDate' => $lastPaymentDate,
            'lastPaymentDays' => $lastPaymentDate ? $this->daysSince($lastPaymentDate) : null,
        ];
    }

    /**
     * The charges that count (no cancelled line, no reversal) of the given
     * subscribers, by subscriber, newest first.
     *
     * @param  array<int, int>  $subscriberIds
     * @return Collection<int, Collection<int, object>>
     */
    private function chargesNewestFirst(array $subscriberIds): Collection
    {
        return SubscriberTransaction::query()
            ->charges()
            ->where('amount', '>', 0)
            ->whereIn('subscriber_id', $subscriberIds)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->toBase()
            ->get(['subscriber_id', 'created_at', 'amount'])
            ->groupBy('subscriber_id');
    }

    /**
     * When each of the given subscribers last paid, by subscriber: their
     * latest payment that still stands.
     *
     * @param  array<int, int>  $subscriberIds
     * @return array<int, string>
     */
    private function lastPayments(array $subscriberIds): array
    {
        return SubscriberTransaction::query()
            ->counted()
            ->where('type', SubscriberTransaction::TYPE_PAYMENT)
            ->whereIn('subscriber_id', $subscriberIds)
            ->groupBy('subscriber_id')
            ->toBase()
            ->selectRaw('subscriber_id, max(created_at) as last_paid_at')
            ->pluck('last_paid_at', 'subscriber_id')
            ->all();
    }

    /**
     * Whole days from a business-time date (Y-m-d) to today.
     */
    private function daysSince(string $date): int
    {
        $day = CarbonImmutable::parse($date, $this->today->getTimezone())->startOfDay();

        return max(0, (int) round($day->diffInDays($this->today)));
    }

    private static function cents(string $amount): int
    {
        return (int) round((float) $amount * 100);
    }
}
