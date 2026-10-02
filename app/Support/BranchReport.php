<?php

namespace App\Support;

use App\Enums\ClosingStatus;
use App\Enums\ClosingType;
use App\Enums\Currency;
use App\Enums\MeterReadingStatus;
use App\Enums\PaymentMethod;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\MeterReading;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * What moved through one branch, or several, between two business days
 * (by the closing cut-off): what the subscribers owed at the start, what
 * was charged, paid, discounted and cleared, what was cancelled, and what
 * they owe at the end — which always adds up, since it is the same lines
 * summed both ways. Also where the payments came in (cash drawer, bank,
 * currency, collector), the readings entered, and each day's closing.
 *
 * A line counts under its own type on the business day it was recorded,
 * unless it was cancelled before that day ended: then it, like every
 * reversal, counts as a correction on its own day. So a period is always
 * the sum of its days, and a past day's figures never change when a line
 * is cancelled later — the cancellation shows on the day it was made.
 * Amounts are worked out in cents.
 */
class BranchReport
{
    /**
     * The types that are neither a charge nor a payment: given off what a
     * subscriber owes.
     */
    private const DISCOUNT_TYPES = [
        SubscriberTransaction::TYPE_DISCOUNT,
        SubscriberTransaction::TYPE_READING_DISCOUNT,
        SubscriberTransaction::TYPE_CLEARING,
    ];

    /**
     * The lines of the period, read once.
     *
     * @var Collection<int, object>|null
     */
    private ?Collection $rows = null;

    /**
     * @param  Collection<int, Branch>  $branches
     */
    public function __construct(
        private Collection $branches,
        private CarbonImmutable $from,
        private CarbonImmutable $to,
    ) {}

    /**
     * The period's account lines of the branches' subscribers, unordered,
     * narrowed to one kind: payments, charges, discounts (discounts and
     * clearings), corrections (cancelled lines and reversals), or all.
     *
     * @return Builder<SubscriberTransaction>
     */
    public function lines(string $kind = 'all'): Builder
    {
        [$start, $end] = $this->utcRange();

        return SubscriberTransaction::query()
            ->whereHas('subscriber', fn (Builder $subscriber) => $subscriber->whereIn('branch_id', $this->branchIds()))
            ->where('subscriber_transactions.created_at', '>=', $start)
            ->where('subscriber_transactions.created_at', '<', $end)
            ->when($kind === 'payments', fn (Builder $query) => $query->where('type', SubscriberTransaction::TYPE_PAYMENT))
            ->when($kind === 'charges', fn (Builder $query) => $query->whereNotIn('type', [...SubscriberTransaction::CREDIT_TYPES, SubscriberTransaction::TYPE_REVERSAL]))
            ->when($kind === 'discounts', fn (Builder $query) => $query->whereIn('type', self::DISCOUNT_TYPES))
            ->when($kind === 'corrections', fn (Builder $query) => $query->where(fn (Builder $inner) => $inner->whereNotNull('cancelled_at')->orWhereNotNull('reverses_id')));
    }

    /**
     * The kinds of line the transactions list can be narrowed to.
     *
     * @return array<int, array{value: string, label: string}>
     */
    public static function kinds(): array
    {
        return [
            ['value' => 'all', 'label' => 'كل الحركات'],
            ['value' => 'payments', 'label' => 'الدفعات'],
            ['value' => 'charges', 'label' => 'التحميلات'],
            ['value' => 'discounts', 'label' => 'الخصومات والمقاصات'],
            ['value' => 'corrections', 'label' => 'الإلغاءات'],
        ];
    }

    /**
     * The balance's flow through the period: what was owed at the start,
     * each kind of charge and credit, the corrections, and what is owed at
     * the end.
     *
     * @return array<string, mixed>
     */
    public function flow(): array
    {
        $labels = SubscriberTransaction::typeLabels();
        $opening = $this->openingBalance();
        $charges = [];
        $credits = [];
        $corrections = ['count' => 0, 'total' => 0];

        foreach ($this->rows() as $row) {
            $cents = Closing::cents($row->amount);

            if ($this->isCorrection($row)) {
                $corrections['count'] += $row->type === SubscriberTransaction::TYPE_REVERSAL ? 1 : 0;
                $corrections['total'] += $cents;

                continue;
            }

            if (in_array($row->type, SubscriberTransaction::CREDIT_TYPES, true)) {
                $credits[$row->type] = ['count' => ($credits[$row->type]['count'] ?? 0) + 1, 'total' => ($credits[$row->type]['total'] ?? 0) - $cents];
            } else {
                $charges[$row->type] = ['count' => ($charges[$row->type]['count'] ?? 0) + 1, 'total' => ($charges[$row->type]['total'] ?? 0) + $cents];
            }
        }

        $list = fn (array $totals, array $order): array => collect($totals)
            ->sortBy(fn (array $total, string $type): int => array_search($type, $order, true) === false ? PHP_INT_MAX : array_search($type, $order, true))
            ->map(fn (array $total, string $type): array => ['type' => $type, 'label' => $labels[$type] ?? $type, 'count' => $total['count'], 'total' => Closing::money($total['total'])])
            ->values()
            ->all();
        $chargesTotal = array_sum(array_column($charges, 'total'));
        $creditsTotal = array_sum(array_column($credits, 'total'));
        $closing = $opening + $chargesTotal - $creditsTotal + $corrections['total'];

        return [
            'opening' => Closing::money($opening),
            'charges' => $list($charges, array_keys($labels)),
            'chargesTotal' => Closing::money($chargesTotal),
            'credits' => $list($credits, SubscriberTransaction::CREDIT_TYPES),
            'creditsTotal' => Closing::money($creditsTotal),
            'corrections' => ['count' => $corrections['count'], 'total' => Closing::money($corrections['total'])],
            'closing' => Closing::money($closing),
            'change' => Closing::money($closing - $opening),
        ];
    }

    /**
     * Where the period's standing payments came in: in all, by receiving
     * account (the cash drawer, each bank or wallet), by currency, and by
     * who collected them.
     *
     * @return array<string, mixed>
     */
    public function collections(): array
    {
        $payments = $this->rows()
            ->filter(fn (object $row): bool => $row->type === SubscriberTransaction::TYPE_PAYMENT && ! $this->isCorrection($row))
            ->map(fn (object $row): object => (object) [...(array) $row, 'cents' => -Closing::cents($row->amount), 'isCash' => $row->payment_method === PaymentMethod::Cash->value]);
        $collectors = User::query()->whereKey($payments->pluck('recorded_by')->filter()->unique()->values())->pluck('name', 'id');
        $group = fn (Collection $rows): array => ['count' => $rows->count(), 'total' => Closing::money($rows->sum('cents'))];

        return [
            'count' => $payments->count(),
            'total' => Closing::money($payments->sum('cents')),
            'cash' => Closing::money($payments->where('isCash', true)->sum('cents')),
            'nonCash' => Closing::money($payments->where('isCash', false)->sum('cents')),
            'accounts' => $payments
                ->groupBy(fn (object $payment): string => $payment->isCash ? 'cash' : ($payment->bank_name ?: $this->methodLabel($payment->payment_method)))
                ->map(fn (Collection $rows, string $account): array => ['key' => $account, 'label' => $account === 'cash' ? 'الصندوق النقدي' : $account, ...$group($rows)])
                ->sortByDesc(fn (array $account): array => [$account['key'] === 'cash', (float) $account['total']])
                ->values()
                ->all(),
            'currencies' => $payments
                ->groupBy(fn (object $payment): string => $payment->currency ?: Currency::Shekel->value)
                ->map(fn (Collection $rows, string $currency): array => [
                    'currency' => $currency,
                    'label' => __(Currency::tryFrom($currency)?->label() ?? $currency),
                    ...$group($rows),
                    'amount' => Closing::money($rows->sum(fn (object $row): int => Closing::cents($row->currency_amount ?? -$row->amount))),
                ])
                ->sortByDesc(fn (array $currency): float => (float) $currency['total'])
                ->values()
                ->all(),
            'collectors' => $payments
                ->groupBy(fn (object $payment): string => (string) $payment->recorded_by)
                ->map(fn (Collection $rows, string $userId): array => [
                    'name' => $collectors[$userId] ?? 'غير معروف',
                    ...$group($rows),
                    'cash' => Closing::money($rows->where('isCash', true)->sum('cents')),
                ])
                ->sortByDesc(fn (array $collector): float => (float) $collector['total'])
                ->values()
                ->all(),
        ];
    }

    /**
     * The weekly readings: how many were entered in the period and the
     * kilowatts they recorded, how many were approved (and billed) in it,
     * and how many still wait for approval now.
     *
     * @return array{entered: int, consumption: float, approved: int, billed: string, pending: int}
     */
    public function readings(): array
    {
        [$start, $end] = $this->utcRange();
        $readings = fn (): Builder => MeterReading::query()->whereIn('branch_id', $this->branchIds());
        $entered = $readings()->where('created_at', '>=', $start)->where('created_at', '<', $end);
        $approved = $readings()->where('approved_at', '>=', $start)->where('approved_at', '<', $end);

        return [
            'entered' => (clone $entered)->count(),
            'consumption' => round((float) $entered->sum('consumption'), 2),
            'approved' => (clone $approved)->count(),
            'billed' => Closing::money(Closing::cents((string) $approved->sum('amount_due'))),
            'pending' => $readings()->where('status', MeterReadingStatus::Pending)->count(),
        ];
    }

    /**
     * One row per day: what was charged, paid, discounted and corrected,
     * what the subscribers owed at the end of it, and its closings.
     *
     * @return array<int, array<string, mixed>>
     */
    public function days(): array
    {
        $byDay = $this->rows()->groupBy(fn (object $row): string => ClosingPeriods::dayOf($row->created_at));
        $closings = $this->dailyClosings()->groupBy(fn (Closing $closing): string => $closing->period_start->toDateString());
        $today = ClosingPeriods::today()->toDateString();
        $balance = $this->openingBalance();
        $days = [];

        foreach (ClosingPeriods::days($this->from, $this->to) as $day) {
            $totals = ['charges' => 0, 'payments' => 0, 'discounts' => 0, 'corrections' => 0];

            foreach ($byDay->get($day, collect()) as $row) {
                $cents = Closing::cents($row->amount);
                $key = match (true) {
                    $this->isCorrection($row) => 'corrections',
                    $row->type === SubscriberTransaction::TYPE_PAYMENT => 'payments',
                    in_array($row->type, self::DISCOUNT_TYPES, true) => 'discounts',
                    default => 'charges',
                };
                $totals[$key] += $key === 'payments' || $key === 'discounts' ? -$cents : $cents;
                $balance += $cents;
            }

            $dayClosings = $closings->get($day, collect());
            $single = $this->branches->count() === 1 ? $dayClosings->first() : null;

            $days[] = [
                'day' => $day,
                ...array_map(fn (int $cents): string => Closing::money($cents), $totals),
                'lines' => $byDay->get($day, collect())->count(),
                'balance' => Closing::money($balance),
                'closing' => [
                    'state' => match (true) {
                        $single !== null => $single->status->value,
                        $day === $today => 'open',
                        $day > $today => 'future',
                        default => $dayClosings->isEmpty() ? 'none' : 'many',
                    },
                    'number' => $single?->number,
                    'opened' => $dayClosings->count(),
                    'approved' => $dayClosings->where('status', ClosingStatus::Approved)->count(),
                ],
            ];
        }

        return $days;
    }

    /**
     * Where one branch's day stands before it is closed: still under way
     * (with when it closes), ended without a closing yet, or its closing's
     * status and cash, and whether the closing still holds every cash
     * payment of the day.
     *
     * @return array<string, mixed>
     */
    public function dayCheck(): array
    {
        $branch = $this->branches->first();
        $day = $this->from->toDateString();
        $cash = $this->rows()
            ->filter(fn (object $row): bool => $row->type === SubscriberTransaction::TYPE_PAYMENT && $row->payment_method === PaymentMethod::Cash->value && ! $this->isCorrection($row))
            ->sum(fn (object $row): int => -Closing::cents($row->amount));

        if (! ClosingPeriods::hasEnded($day)) {
            return ['state' => 'open', 'closesAt' => ClosingPeriods::dayEnd($day)->format('d/m H:i'), 'reportCash' => Closing::money($cash)];
        }

        $closing = $this->dailyClosings()->first();

        if ($closing === null) {
            return ['state' => 'none', 'reportCash' => Closing::money($cash), 'branchId' => $branch->id, 'day' => $day];
        }

        $figures = $closing->cashFigures();

        return [
            'state' => $closing->status->value,
            'statusLabel' => __($closing->status->label()),
            'number' => $closing->number,
            'branchId' => $branch->id,
            'day' => $day,
            'reportCash' => Closing::money($cash),
            'closingCash' => Closing::money($figures['receipts']),
            'expected' => Closing::money($figures['expected']),
            'counted' => $figures['counted'] === null ? null : Closing::money($figures['counted']),
            'difference' => $figures['difference'] === null ? null : Closing::money($figures['difference']),
            'matches' => $figures['receipts'] === $cash,
        ];
    }

    /**
     * What the branches' subscribers owed when the period started: every
     * line recorded before it, cancelled or not, since a cancellation's
     * reversal takes its amount back off when it is recorded.
     */
    private function openingBalance(): int
    {
        [$start] = $this->utcRange();

        return Closing::cents((string) SubscriberTransaction::query()
            ->whereHas('subscriber', fn (Builder $subscriber) => $subscriber->whereIn('branch_id', $this->branchIds()))
            ->where('subscriber_transactions.created_at', '<', $start)
            ->sum('amount'));
    }

    /**
     * Whether a line counts as a correction rather than under its type: a
     * reversal, or a line cancelled before the day it was recorded on ended.
     */
    private function isCorrection(object $row): bool
    {
        return $row->reverses_id !== null
            || ($row->cancelled_at !== null && CarbonImmutable::parse($row->cancelled_at, 'UTC')->lessThan(ClosingPeriods::dayEnd(ClosingPeriods::dayOf($row->created_at))));
    }

    /**
     * @return Collection<int, object>
     */
    private function rows(): Collection
    {
        return $this->rows ??= $this->lines()->toBase()->get([
            'subscriber_transactions.id', 'type', 'amount', 'payment_method', 'bank_name', 'currency', 'currency_amount',
            'recorded_by', 'reverses_id', 'cancelled_at', 'subscriber_transactions.created_at',
        ]);
    }

    /**
     * @return Collection<int, Closing>
     */
    private function dailyClosings(): Collection
    {
        return Closing::query()
            ->where('type', ClosingType::Daily)
            ->whereIn('branch_id', $this->branchIds())
            ->whereDate('period_start', '>=', $this->from->toDateString())
            ->whereDate('period_start', '<=', $this->to->toDateString())
            ->get();
    }

    /**
     * @return array<int, int>
     */
    private function branchIds(): array
    {
        return $this->branches->pluck('id')->all();
    }

    /**
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    private function utcRange(): array
    {
        return ClosingPeriods::utcRange($this->from, $this->to);
    }

    private function methodLabel(?string $method): string
    {
        $method = $method === null ? null : PaymentMethod::tryFrom($method);

        return $method === null ? 'أخرى' : __($method->label());
    }
}
