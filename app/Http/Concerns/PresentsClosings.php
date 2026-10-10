<?php

namespace App\Http\Concerns;

use App\Enums\CashTransferMethod;
use App\Enums\CashTransferStatus;
use App\Enums\ClosingDifferenceReason;
use App\Enums\ClosingMatchStatus;
use App\Enums\ClosingStatus;
use App\Enums\ClosingType;
use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\CashTransfer;
use App\Models\Closing;
use App\Models\ClosingEvent;
use App\Models\ClosingPayment;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Support\ClosingPeriods;
use App\Support\DailySeries;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * What the closing page shows: a branch's daily closing, the cash it hands
 * over, and the company's week and month — always worked out from the
 * original payments, never by adding up closings' totals.
 */
trait PresentsClosings
{
    /**
     * The branches whose closings the user may open: every branch for a
     * reviewer, a financial auditor or the Super Admin, otherwise their own.
     *
     * @return Collection<int, Branch>
     */
    protected function visibleBranches(User $user): Collection
    {
        return Branch::query()
            ->when(! $user->isSuperAdmin() && ! $user->can('viewAllBranches', Closing::class), fn (Builder $query) => $query->whereKey($user->branch_id))
            ->orderBy('name')
            ->get();
    }

    /**
     * @return array<string, mixed>
     */
    protected function dailyClosingData(Closing $closing, User $user): array
    {
        $closing->syncPayments();
        $closing->load(['branch', 'preparedBy', 'reviewedBy', 'events.user']);
        $lines = $closing->paymentLines();
        $cash = $closing->cashFigures();
        $unconfirmed = $lines->filter(fn (ClosingPayment $line): bool => $line->match_status === ClosingMatchStatus::Unconfirmed);

        return [
            ...$this->closingHeader($closing),
            'lines' => $lines->reject(fn (ClosingPayment $line): bool => $line->match_status === ClosingMatchStatus::Unconfirmed)->map(fn (ClosingPayment $line) => $this->closingLine($line))->values(),
            'unconfirmed' => $unconfirmed->map(fn (ClosingPayment $line) => $this->closingLine($line))->values(),
            'unconfirmedTotal' => Closing::money($unconfirmed->sum(fn (ClosingPayment $line): int => -Closing::cents($line->payment->amount))),
            'total' => Closing::money($closing->confirmedTotalInCents()),
            'accounts' => $this->closingAccounts($lines, $cash),
            'cash' => array_map(fn (?int $cents): ?string => $cents === null ? null : Closing::money($cents), $cash),
            'cashRefunds' => $closing->cashRefunds()->map(fn (SubscriptionTransaction $refund): array => [
                'id' => $refund->id,
                'voucherNumber' => $refund->referenceTransaction->printedVoucherNumber(),
                'subscriptionName' => $refund->subscription->displayName(),
                'time' => DailySeries::localTime($refund->created_at),
                'amount' => Closing::money(Closing::cents($refund->amount)),
            ])->values(),
            'denominations' => $closing->denominations ?? (object) [],
            'differenceReason' => $closing->difference_reason?->value,
            'differenceNotes' => $closing->difference_notes,
            'blockers' => $closing->status->isEditable() ? $closing->submissionBlockers() : [],
            'events' => $closing->events->sortByDesc('id')->map(fn (ClosingEvent $event): array => [
                'id' => $event->id,
                'description' => $event->description,
                'by' => $event->user?->name ?? 'النظام',
                'at' => $this->closingTime($event->created_at),
                'action' => $event->action,
            ])->values(),
            'can' => [
                'prepare' => $user->can('prepare', $closing),
                'audit' => $user->can('audit', $closing),
                'approve' => $user->can('audit', $closing) && $closing->prepared_by !== $user->id,
                'handOver' => $user->can('handOver', $closing),
            ],
        ];
    }

    /**
     * The closing's number, branch, day, status and who did what.
     *
     * @return array<string, mixed>
     */
    protected function closingHeader(Closing $closing): array
    {
        return [
            'id' => $closing->id,
            'number' => $closing->number,
            'branchName' => $closing->branch?->name,
            'day' => $closing->period_start->toDateString(),
            'status' => $closing->status->value,
            'statusLabel' => __($closing->status->label()),
            'preparedBy' => $closing->preparedBy?->name,
            'preparedById' => $closing->prepared_by,
            'submittedAt' => $this->closingTime($closing->submitted_at),
            'reviewedBy' => $closing->reviewedBy?->name,
            'reviewedAt' => $this->closingTime($closing->reviewed_at),
            'returnReason' => $closing->return_reason,
            'countedCash' => $closing->counted_cash,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function closingLine(ClosingPayment $line): array
    {
        $payment = $line->payment;

        return [
            'id' => $line->id,
            'paymentId' => $payment->id,
            'voucherNumber' => $payment->printedVoucherNumber(),
            'subscriptionName' => $payment->subscription->displayName(),
            'meterBoxNumber' => $payment->subscription->meterBox?->box_number,
            'account' => $line->match_status === null ? 'cash' : $payment->bank_name,
            'accountLabel' => $line->match_status === null ? 'الصندوق النقدي' : $payment->bank_name,
            'recordedBy' => $payment->recordedBy?->name,
            'time' => DailySeries::localTime($payment->created_at),
            'reference' => $payment->reference_number,
            'splitPayment' => $payment->splitPayment?->badge(),
            'amount' => Closing::money(-Closing::cents($payment->amount)),
            'matchStatus' => $line->match_status?->value,
        ];
    }

    /**
     * One card per receiving account in the closing: the cash drawer and
     * each bank or wallet, with what came in and where its check stands.
     *
     * @param  Collection<int, ClosingPayment>  $lines
     * @param  array<string, int|null>  $cash
     * @return array<int, array<string, mixed>>
     */
    private function closingAccounts(Collection $lines, array $cash): array
    {
        $accounts = [[
            'key' => 'cash',
            'label' => 'الصندوق النقدي',
            'count' => 0,
            'total' => 0,
            'pending' => 0,
            'difference' => $cash['difference'] === null ? null : Closing::money($cash['difference']),
        ]];

        foreach ($lines->reject(fn (ClosingPayment $line): bool => $line->match_status === ClosingMatchStatus::Unconfirmed) as $line) {
            $key = $line->match_status === null ? 'cash' : $line->payment->bank_name;
            $index = collect($accounts)->search(fn (array $account): bool => $account['key'] === $key);

            if ($index === false) {
                $accounts[] = ['key' => $key, 'label' => $key, 'count' => 0, 'total' => 0, 'pending' => 0, 'difference' => null];
                $index = count($accounts) - 1;
            }

            $accounts[$index]['count']++;
            $accounts[$index]['total'] += -Closing::cents($line->payment->amount);
            $accounts[$index]['pending'] += $line->match_status === ClosingMatchStatus::Pending ? 1 : 0;
        }

        return array_map(fn (array $account): array => [...$account, 'total' => Closing::money($account['total'])], $accounts);
    }

    /**
     * The cash handover for an approved closing: what the branch counted,
     * what it has handed over, what is on its way and what has arrived.
     *
     * @return array<string, mixed>
     */
    protected function handoverData(Closing $closing, User $user): array
    {
        $closing->loadMissing('branch', 'preparedBy');
        $transfers = $closing->transfers()->with(['sender', 'recipient', 'receivedBy'])->latest('sent_at')->get();
        $sent = $transfers->sum(fn (CashTransfer $transfer): int => Closing::cents($transfer->amount));
        $inTransit = $transfers->where('status', CashTransferStatus::InTransit)->sum(fn (CashTransfer $transfer): int => Closing::cents($transfer->amount));
        $counted = Closing::cents($closing->counted_cash);
        $nonCash = $closing->paymentLines()
            ->filter(fn (ClosingPayment $line): bool => $line->match_status === ClosingMatchStatus::Matched)
            ->groupBy(fn (ClosingPayment $line): string => $line->payment->bank_name)
            ->map(fn (Collection $lines, string $bank): array => ['label' => $bank, 'total' => Closing::money($lines->sum(fn (ClosingPayment $line): int => -Closing::cents($line->payment->amount)))])
            ->values();

        return [
            ...$this->closingHeader($closing),
            'total' => Closing::money($closing->confirmedTotalInCents()),
            'nonCashAccounts' => $nonCash,
            'branchCash' => Closing::money($counted - $sent),
            'inTransit' => Closing::money($inTransit),
            'received' => Closing::money($sent - $inTransit),
            'remaining' => Closing::money(max(0, $counted - $sent)),
            'transfers' => $transfers->map(fn (CashTransfer $transfer): array => [
                'id' => $transfer->id,
                'amount' => $transfer->amount,
                'method' => $transfer->method->value,
                'methodLabel' => __($transfer->method->label()),
                'senderName' => $transfer->sender?->name,
                'recipientName' => $transfer->recipient?->name,
                'sentAt' => $this->closingTime($transfer->sent_at),
                'status' => $transfer->status->value,
                'statusLabel' => __($transfer->status->label()),
                'receivedAt' => $this->closingTime($transfer->received_at),
                'receivedBy' => $transfer->receivedBy?->name,
                'notes' => $transfer->notes,
                'canConfirm' => $user->can('confirmReceipt', $transfer),
            ])->values(),
            'recipients' => $this->transferRecipients($user),
            'methods' => CashTransferMethod::options(),
            'can' => ['handOver' => $user->can('handOver', $closing)],
        ];
    }

    /**
     * Who can receive the branches' cash: the Super Admins and the
     * reviewers, other than the sender.
     *
     * @return array<int, array{value: int, label: string}>
     */
    protected function transferRecipients(User $sender): array
    {
        return User::query()
            ->where('is_active', true)
            ->whereKeyNot($sender->id)
            ->where(fn (Builder $query) => $query
                ->where('role', UserRole::SuperAdmin)
                ->orWhereHas('permissions', fn (Builder $permission) => $permission->where('key', PermissionKey::AuditClosings->value)))
            ->orderBy('name')
            ->get()
            ->map(fn (User $user): array => ['value' => $user->id, 'label' => $user->role === UserRole::SuperAdmin ? "{$user->name} · المدير العام" : $user->name])
            ->all();
    }

    /**
     * The week (`weekly`) or month (`monthly`) containing the date, for the
     * given branches: every branch's day by day, each day's closing status,
     * what was collected by payment date, and what still stands in the way
     * of approving the period.
     *
     * @param  Collection<int, Branch>  $branches
     * @return array<string, mixed>
     */
    protected function periodData(string $period, CarbonImmutable $date, Collection $branches, User $user): array
    {
        [$first, $last] = $period === 'monthly' ? ClosingPeriods::month($date) : ClosingPeriods::week($date);
        $type = $period === 'monthly' ? ClosingType::Monthly : ClosingType::Weekly;
        $days = ClosingPeriods::days($first, $last);
        $today = ClosingPeriods::furthestToday($branches)->toDateString();
        $closings = Closing::query()
            ->with(['lines.payment.splitPayment'])
            ->where('type', ClosingType::Daily)
            ->whereIn('branch_id', $branches->modelKeys())
            ->whereDate('period_start', '>=', $first->toDateString())
            ->whereDate('period_start', '<=', $last->toDateString())
            ->get()
            ->keyBy(fn (Closing $closing): string => $closing->branch_id.'|'.$closing->period_start->toDateString());
        $collected = $this->collectionsByBranchAndDay($branches, $first, $last);
        $transfers = CashTransfer::query()->whereIn('branch_id', $branches->modelKeys())->where('status', CashTransferStatus::InTransit)->get();

        $rows = $branches->map(function (Branch $branch) use ($days, $closings, $collected, $transfers): array {
            $today = ClosingPeriods::for($branch)->today()->toDateString();
            $cells = [];
            $approved = 0;
            $needed = 0;

            foreach ($days as $day) {
                $closing = $closings->get($branch->id.'|'.$day);
                $hasPayments = ($collected[$branch->id][$day]['total'] ?? 0) !== 0;
                $state = match (true) {
                    $closing !== null => $closing->status->value,
                    $day === $today => 'open',
                    $day > $today => 'future',
                    $hasPayments => 'missing',
                    default => 'empty',
                };

                if ($day < $today && ($closing !== null || $hasPayments)) {
                    $needed++;
                    $approved += $closing?->status === ClosingStatus::Approved ? 1 : 0;
                }

                $cells[] = ['day' => $day, 'state' => $state, 'number' => $closing?->number, 'total' => Closing::money($collected[$branch->id][$day]['total'] ?? 0)];
            }

            $byMethod = collect($collected[$branch->id] ?? []);

            return [
                'branchId' => $branch->id,
                'branchName' => $branch->name,
                'cells' => $cells,
                'total' => Closing::money($byMethod->sum('total')),
                'cash' => Closing::money($byMethod->sum('cash')),
                'nonCash' => Closing::money($byMethod->sum('total') - $byMethod->sum('cash')),
                'inTransit' => Closing::money($transfers->where('branch_id', $branch->id)->sum(fn (CashTransfer $transfer): int => Closing::cents($transfer->amount))),
                'pending' => Closing::money($closings->filter(fn (Closing $closing): bool => $closing->branch_id === $branch->id)->sum(fn (Closing $closing): int => $this->unconfirmedCents($closing))),
                'approved' => $approved,
                'needed' => $needed,
            ];
        })->values();

        $unapproved = $rows->sum(fn (array $row): int => $row['needed'] - $row['approved']);
        $differences = $closings->filter(fn (Closing $closing): bool => $closing->counted_cash !== null)
            ->map(fn (Closing $closing): array => ['branch' => $branches->firstWhere('id', $closing->branch_id)?->name, 'difference' => $closing->cashFigures()['difference']])
            ->filter(fn (array $difference): bool => $difference['difference'] !== 0)
            ->groupBy('branch')
            ->map(fn (Collection $branchDifferences, string $branch): array => ['branch' => $branch, 'difference' => $branchDifferences->sum('difference'), 'days' => $branchDifferences->count()])
            ->values();
        $pending = $closings->sum(fn (Closing $closing): int => $this->unconfirmedCents($closing));
        $pendingCount = $closings->sum(fn (Closing $closing): int => $closing->lines->where('match_status', ClosingMatchStatus::Unconfirmed)->count());
        $saved = Closing::query()->with('reviewedBy')->where('number', $this->periodNumber($type, $first))->first();
        $ended = ClosingPeriods::hasEndedInAll($branches, $last);

        return [
            'period' => $period,
            'number' => $this->periodNumber($type, $first),
            'first' => $first->toDateString(),
            'last' => $last->toDateString(),
            'days' => array_map(fn (string $day): array => ['date' => $day, 'isToday' => $day === $today], $days),
            'rows' => $rows,
            'dayTotals' => array_map(fn (string $day): string => Closing::money($branches->sum(fn (Branch $branch): int => $collected[$branch->id][$day]['total'] ?? 0)), $days),
            'collected' => Closing::money($rows->sum(fn (array $row): int => Closing::cents($row['total']))),
            'unapproved' => $unapproved,
            'needed' => $rows->sum('needed'),
            'differences' => $differences->map(fn (array $difference): array => [...$difference, 'difference' => Closing::money($difference['difference'])]),
            'differenceTotal' => Closing::money($differences->sum('difference')),
            'pending' => Closing::money($pending),
            'pendingCount' => $pendingCount,
            'inTransit' => Closing::money($transfers->sum(fn (CashTransfer $transfer): int => Closing::cents($transfer->amount))),
            'inTransitCount' => $transfers->count(),
            'ended' => $ended,
            'status' => $saved ? $saved->status->value : 'draft',
            'statusLabel' => $saved ? __($saved->status->label()) : __(ClosingStatus::Draft->label()),
            'approvedBy' => $saved?->reviewedBy?->name,
            'approvedAt' => $this->closingTime($saved?->reviewed_at),
            'blockers' => $this->periodBlockers($ended, $unapproved, $last),
            'canApprove' => $saved === null && $user->can('approvePeriod', Closing::class) && $ended && $unapproved === 0,
        ];
    }

    /**
     * @return array<int, string>
     */
    protected function periodBlockers(bool $ended, int $unapproved, CarbonImmutable $last): array
    {
        return array_values(array_filter([
            $ended ? null : 'الفترة لم تنتهِ بعد؛ تنتهي يوم '.$last->format('d/m').' عند وقت القطع.',
            $unapproved > 0 ? "{$unapproved} إغلاقات يومية غير معتمدة؛ كل يوم فيه دفعات في كل فرع يجب أن يُعتمد أولًا." : null,
        ]));
    }

    /**
     * The week's number by the ISO week its first day falls in (W-2026-39),
     * or the month's (M-2026-09).
     */
    protected function periodNumber(ClosingType $type, CarbonImmutable $first): string
    {
        return $type === ClosingType::Monthly
            ? 'M-'.$first->format('Y-m')
            : sprintf('W-%d-%02d', $first->isoWeekYear(), $first->isoWeek());
    }

    /**
     * What each branch collected each day, from the payments themselves
     * (by their business date), in cents: in all and in cash.
     *
     * @param  Collection<int, Branch>  $branches
     * @return array<int, array<string, array{total: int, cash: int}>>
     */
    private function collectionsByBranchAndDay(Collection $branches, CarbonImmutable $first, CarbonImmutable $last): array
    {
        $collected = [];

        foreach ($branches as $branch) {
            $periods = ClosingPeriods::for($branch);

            Closing::paymentsReceived($branch->id, $first, $last)
                ->get(['id', 'amount', 'payment_method', 'created_at'])
                ->each(function ($payment) use (&$collected, $branch, $periods): void {
                    $day = $periods->dayOf($payment->created_at);
                    $cents = -Closing::cents($payment->amount);
                    $collected[$branch->id][$day]['total'] = ($collected[$branch->id][$day]['total'] ?? 0) + $cents;
                    $collected[$branch->id][$day]['cash'] = ($collected[$branch->id][$day]['cash'] ?? 0) + ($payment->payment_method?->value === 'cash' ? $cents : 0);
                });
        }

        return $collected;
    }

    private function unconfirmedCents(Closing $closing): int
    {
        return $closing->lines
            ->where('match_status', ClosingMatchStatus::Unconfirmed)
            ->sum(fn (ClosingPayment $line): int => -Closing::cents($line->payment->amount));
    }

    /**
     * The day, week and month a branch's day belongs to, each with what it
     * collected — the same payments seen at three levels, never added up.
     *
     * @return array<string, mixed>
     */
    protected function closingLevels(Branch $branch, CarbonImmutable $day): array
    {
        [$weekFirst, $weekLast] = ClosingPeriods::week($day);
        [$monthFirst, $monthLast] = ClosingPeriods::month($day);
        $sum = fn (CarbonImmutable $first, CarbonImmutable $last): string => Closing::money(-Closing::cents((string) Closing::paymentsReceived($branch->id, $first, $last)->sum('amount')));
        $daily = Closing::query()->where('type', ClosingType::Daily)->where('branch_id', $branch->id)->whereDate('period_start', $day->toDateString())->first();

        return [
            'branchName' => $branch->name,
            'day' => ['date' => $day->toDateString(), 'number' => $daily?->number, 'count' => Closing::paymentsReceived($branch->id, $day, $day)->count(), 'total' => $sum($day, $day)],
            'week' => ['first' => $weekFirst->toDateString(), 'last' => $weekLast->toDateString(), 'total' => $sum($weekFirst, $weekLast)],
            'month' => ['first' => $monthFirst->toDateString(), 'total' => $sum($monthFirst, $monthLast)],
        ];
    }

    /**
     * The closings register: every branch's daily closings between two
     * days, each with its figures, the totals, and the branch-days that
     * had payments but no closing yet.
     *
     * @param  Collection<int, Branch>  $branches
     * @return array<string, mixed>
     */
    protected function registerData(Collection $branches, CarbonImmutable $from, CarbonImmutable $to, ?ClosingStatus $status): array
    {
        $closings = Closing::query()
            ->with(['branch', 'preparedBy', 'reviewedBy', 'transfers', 'lines.payment.splitPayment'])
            ->where('type', ClosingType::Daily)
            ->whereIn('branch_id', $branches->modelKeys())
            ->whereDate('period_start', '>=', $from->toDateString())
            ->whereDate('period_start', '<=', $to->toDateString())
            ->when($status, fn (Builder $query) => $query->where('status', $status))
            ->orderByDesc('period_start')
            ->get()
            ->sortBy(fn (Closing $closing): array => [-$closing->period_start->timestamp, $closing->branch->name])
            ->values();

        $rows = $closings->map(function (Closing $closing): array {
            $cash = $closing->cashFigures();
            $handedOver = $closing->transfers->sum(fn (CashTransfer $transfer): int => Closing::cents($transfer->amount));
            $received = $closing->transfers->where('status', CashTransferStatus::Received)->sum(fn (CashTransfer $transfer): int => Closing::cents($transfer->amount));

            return [
                'id' => $closing->id,
                'day' => $closing->period_start->toDateString(),
                'branchId' => $closing->branch_id,
                'branchName' => $closing->branch->name,
                'number' => $closing->number,
                'status' => $closing->status->value,
                'statusLabel' => __($closing->status->label()),
                'payments' => $closing->lines->where('match_status', '!==', ClosingMatchStatus::Unconfirmed)->count(),
                'total' => $closing->confirmedTotalInCents(),
                'expected' => $cash['expected'],
                'counted' => $cash['counted'],
                'difference' => $cash['difference'],
                'pending' => $this->unconfirmedCents($closing),
                'handedOver' => $handedOver,
                'received' => $received,
                'preparedBy' => $closing->preparedBy?->name,
                'reviewedBy' => $closing->status === ClosingStatus::Approved ? $closing->reviewedBy?->name : null,
                'reviewedAt' => $closing->status === ClosingStatus::Approved ? $this->closingTime($closing->reviewed_at) : null,
            ];
        });

        $opened = $closings->map(fn (Closing $closing): string => $closing->branch_id.'|'.$closing->period_start->toDateString())->all();
        $collected = $this->collectionsByBranchAndDay($branches, $from, $to);
        $missing = $status !== null ? [] : collect($collected)
            ->flatMap(fn (array $days, int $branchId) => collect($days)->map(fn (array $day, string $date): array => ['branchId' => $branchId, 'day' => $date, 'total' => $day['total']]))
            ->filter(fn (array $day): bool => $day['day'] < ClosingPeriods::for($day['branchId'])->today()->toDateString() && ! in_array($day['branchId'].'|'.$day['day'], $opened, true))
            ->map(fn (array $day): array => [...$day, 'branchName' => $branches->firstWhere('id', $day['branchId'])?->name, 'total' => Closing::money($day['total'])])
            ->sortByDesc('day')
            ->values()
            ->all();
        $money = fn (?int $cents): ?string => $cents === null ? null : Closing::money($cents);

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'status' => $status?->value,
            'statuses' => ClosingStatus::options(),
            'rows' => $rows->map(fn (array $row): array => [
                ...$row,
                ...collect($row)->only(['total', 'expected', 'counted', 'difference', 'pending', 'handedOver', 'received'])->map($money)->all(),
            ])->values(),
            'missing' => $missing,
            'totals' => [
                'closings' => $rows->count(),
                'approved' => $rows->where('status', ClosingStatus::Approved->value)->count(),
                'total' => Closing::money($rows->sum('total')),
                'counted' => Closing::money($rows->sum(fn (array $row): int => $row['counted'] ?? 0)),
                'difference' => Closing::money($rows->sum(fn (array $row): int => $row['difference'] ?? 0)),
                'pending' => Closing::money($rows->sum('pending')),
                'handedOver' => Closing::money($rows->sum('handedOver')),
                'received' => Closing::money($rows->sum('received')),
            ],
        ];
    }

    /**
     * @return array<int, array{value: string, label: string}>
     */
    protected function differenceReasons(): array
    {
        return ClosingDifferenceReason::options();
    }

    private function closingTime(mixed $timestamp): ?string
    {
        return $timestamp === null ? null : $timestamp->timezone(config('app.business_timezone'))->format('d/m H:i');
    }
}
