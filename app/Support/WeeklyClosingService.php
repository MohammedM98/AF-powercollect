<?php

namespace App\Support;

use App\Enums\ClosingPeriodStatus;
use App\Enums\ClosingStatus;
use App\Enums\ClosingType;
use App\Enums\PaymentMethod;
use App\Models\Closing;
use App\Models\ClosingEvent;
use App\Models\ClosingPeriod;
use App\Models\ClosingSetting;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class WeeklyClosingService
{
    /** Serialize closing, schedule changes, and ledger writes on the same permanent row. */
    public function lock(): ClosingSetting
    {
        $setting = ClosingSetting::query()->oldest('id')->lockForUpdate()->first();
        if ($setting === null) {
            $setting = ClosingSetting::loadCurrent();
        }
        app()->instance(ClosingSetting::class, $setting);

        return $setting;
    }

    /** @return array{first: CarbonImmutable, last: CarbonImmutable, from: CarbonImmutable, cutoff: CarbonImmutable, timezone: string} */
    public function boundaries(CarbonInterface|string $date): array
    {
        $setting = ClosingSetting::current();
        $timezone = $setting->weekly_timezone ?: config('app.business_timezone');
        $day = CarbonImmutable::parse($date instanceof CarbonInterface ? $date->toDateString() : $date, $timezone)->startOfDay();
        $closingDay = $setting->weekly_closing_day ?? ($setting->week_starts_on + 6) % 7;
        $first = $day->startOfWeek(($closingDay + 1) % 7);
        $last = $first->addDays(6);
        $time = $setting->weekly_closing_time ? substr($setting->weekly_closing_time, 0, 5) : $setting->cutoff();
        $cutoff = $time === '00:00' ? $last->addDay() : $last->setTimeFromTimeString($time);

        return ['first' => $first, 'last' => $last, 'from' => $cutoff->subWeek()->utc(), 'cutoff' => $cutoff->utc(), 'timezone' => $timezone];
    }

    public function forDate(CarbonInterface|string $date): ClosingPeriod
    {
        return DB::transaction(function () use ($date): ClosingPeriod {
            $this->lock();

            return $this->resolveDate($date);
        });
    }

    private function resolveDate(CarbonInterface|string $date): ClosingPeriod
    {
        $day = $date instanceof CarbonInterface ? $date->toDateString() : $date;
        $existing = ClosingPeriod::query()->where('period_start', '<=', $day)->where('period_end', '>=', $day)->oldest('id')->first();

        if ($existing !== null) {
            return $existing;
        }

        $range = $this->boundaries($date);
        $previous = ClosingPeriod::query()->where('cutoff_at', '<=', $range['cutoff'])->orderByDesc('cutoff_at')->first();
        if ($previous !== null && $previous->cutoff_at->greaterThan($range['from']) && $previous->cutoff_at->lessThan($range['cutoff'])) {
            $range['from'] = $previous->cutoff_at;
            $range['first'] = $previous->period_end->addDay();
        }
        $number = sprintf('W-%d-%02d', $range['first']->isoWeekYear(), $range['first']->isoWeek());
        $baseNumber = $number;
        $sequence = 1;
        while (ClosingPeriod::query()->where('number', $number)->exists()) {
            $number = $baseNumber.'-'.str_pad((string) ++$sequence, 2, '0', STR_PAD_LEFT);
        }
        $legacy = Closing::query()->where('number', $number)->where('type', ClosingType::Weekly)->where('status', ClosingStatus::Approved)->first();

        return ClosingPeriod::query()->firstOrCreate(['number' => $number], [
            'period_start' => $range['first']->toDateString(), 'period_end' => $range['last']->toDateString(),
            'starts_at' => $range['from'], 'cutoff_at' => $range['cutoff'],
            'eligible_at' => $range['cutoff']->addMinutes(ClosingSetting::current()->grace_period_minutes),
            'timezone' => $range['timezone'], 'status' => $legacy ? ClosingPeriodStatus::Closed : ClosingPeriodStatus::Open,
            'closing_id' => $legacy?->id, 'closed_at' => $legacy?->reviewed_at, 'closed_by' => $legacy?->reviewed_by,
        ]);
    }

    public function forMoment(CarbonInterface $moment): ClosingPeriod
    {
        $existing = ClosingPeriod::query()->where('starts_at', '<=', $moment)->where('cutoff_at', '>', $moment)->oldest('id')->first();

        if ($existing !== null) {
            return $existing;
        }

        $range = $this->boundaries($moment->toImmutable()->setTimezone(ClosingSetting::current()->weekly_timezone ?: config('app.business_timezone')));
        $date = $moment->greaterThanOrEqualTo($range['cutoff']) ? $range['last']->addDay() : $range['first'];

        $period = $this->forDate($date);
        if ($moment->greaterThanOrEqualTo($period->cutoff_at)) {
            return $this->forDate($period->period_end->addDay());
        }

        return $period;
    }

    public function prepare(ClosingPeriod $period, ?User $actor = null): ClosingPeriod
    {
        return DB::transaction(function () use ($period, $actor): ClosingPeriod {
            $this->lock();
            $period->refresh();
            if ($period->status === ClosingPeriodStatus::Open && now()->greaterThanOrEqualTo($period->cutoff_at)) {
                $period->update(['status' => ClosingPeriodStatus::ReadyToClose, 'prepared_at' => now()]);
                ClosingEvent::create(['closing_period_id' => $period->id, 'user_id' => $actor?->id, 'action' => 'PERIOD_PREPARED', 'description' => 'أُعدّت الفترة للمراجعة دون اعتماد نهائي.']);
            }

            return $period;
        });
    }

    /** Capture an explicitly labelled baseline for old closings that never stored a snapshot.
     * @param  array<string, mixed>  $view
     */
    public function freezeLegacy(Closing $closing, array $view): void
    {
        DB::transaction(function () use ($closing, $view): void {
            $this->lock();
            $closing->refresh();
            if ($closing->snapshot !== null) {
                return;
            }
            $period = $this->forDate($closing->period_start);
            $report = $this->report($period);
            $closing->update(['snapshot' => ['view' => $view, 'report' => $report, 'cutoffAt' => $period->cutoff_at->toIso8601String(), 'startsAt' => $period->starts_at->toIso8601String(), 'timezone' => $period->timezone,
                'closedBy' => $closing->reviewedBy?->name, 'closedAt' => $closing->reviewed_at?->toIso8601String(), 'legacyBaseline' => true, 'baselineCapturedAt' => now()->toIso8601String()]]);
            foreach ($report['lines'] as $line) {
                $closing->snapshotLines()->create(['subscription_transaction_id' => $line['transactionId'], 'classification' => $line['classification'], 'ledger_effect' => $line['ledgerEffect'], 'collection_effect' => $line['collectionEffect'], 'payment_method' => $line['method'], 'channel' => $line['channel'], 'details' => $line]);
            }
            $closing->record(null, 'LEGACY_BASELINE_CAPTURED', 'تثبيت البيانات المتاحة وقت الترقية؛ ليست إعادة بناء مؤكدة للقطة تاريخ الاعتماد.');
        });
    }

    /** @return Builder<SubscriptionTransaction> */
    public function transactions(ClosingPeriod $period): Builder
    {
        return SubscriptionTransaction::query()->where(function (Builder $query) use ($period): void {
            $query->where('closing_period_id', $period->id)->orWhere(function (Builder $legacy) use ($period): void {
                $legacy->whereNull('closing_period_id')->where('created_at', '>=', $period->starts_at)->where('created_at', '<', $period->cutoff_at);
            });
        });
    }

    /** @return array<string, mixed> */
    public function report(ClosingPeriod $period, ?array $branchIds = null): array
    {
        $transactions = $this->transactions($period)->when($branchIds !== null, fn (Builder $query): Builder => $query->whereHas('subscription', fn (Builder $subscription): Builder => $subscription->whereIn('branch_id', $branchIds)))
            ->with(['recordedBy', 'referenceTransaction', 'subscription.branch'])->orderBy('id')->get();

        return $this->describeTransactions($transactions, $period->number, $period->starts_at);
    }

    /** @param array<int, int> $branchIds
     * @return array<string, mixed>
     */
    public function reportBetween(CarbonInterface $startsAt, CarbonInterface $endsAt, array $branchIds): array
    {
        $transactions = SubscriptionTransaction::query()
            ->where('created_at', '>=', $startsAt)->where('created_at', '<', $endsAt)
            ->whereHas('subscription', fn (Builder $query): Builder => $query->whereIn('branch_id', $branchIds))
            ->with(['recordedBy', 'referenceTransaction', 'subscription.branch'])->orderBy('id')->get();

        return $this->describeTransactions($transactions, '', $startsAt);
    }

    /** @param Collection<int, SubscriptionTransaction> $transactions
     * @return array<string, mixed>
     */
    private function describeTransactions(Collection $transactions, string $number, CarbonInterface $startsAt): array
    {
        $lines = $transactions->map(function (SubscriptionTransaction $transaction) use ($number, $startsAt): array {
            $effect = $this->collectionEffect($transaction);
            $original = $transaction->referenceTransaction;
            $classification = $transaction->adjustment_type ?: ($transaction->is_late_entry ? 'late_entry' : ($transaction->type === SubscriptionTransaction::TYPE_REFUND ? 'refund' : ($transaction->isReversal() ? 'reversal' : ($transaction->isPayment() ? 'payment' : 'charge'))));

            return [
                'transactionId' => $transaction->id, 'subscriptionId' => $transaction->subscription_id,
                'subscriptionName' => $transaction->subscription?->displayName(), 'voucherNumber' => $transaction->printedVoucherNumber(),
                'reference' => $transaction->reference_number,
                'branchId' => $transaction->branch_id ?? $transaction->subscription?->branch_id,
                'branchName' => $transaction->subscription?->branch?->name,
                'type' => $transaction->type, 'classification' => $classification,
                'ledgerEffect' => $transaction->amount, 'collectionEffect' => Closing::money($effect),
                'method' => $transaction->payment_method?->value,
                'channel' => $transaction->bank_name ?: __($transaction->payment_method?->label() ?? 'Other'),
                'actualAt' => ($transaction->actual_at ?? $transaction->created_at)->toIso8601String(),
                'recordedAt' => ($transaction->recorded_at ?? $transaction->created_at)->toIso8601String(),
                'period' => $number, 'reason' => $transaction->adjustment_reason ?? $transaction->notes ?? $original?->cancellation_notes ?? $original?->cancellation_reason?->label(),
                'enteredBy' => $transaction->recordedBy?->name, 'originalId' => $original?->id,
                'originalAmount' => $original?->amount, 'originalDate' => $original?->created_at?->toIso8601String(),
                'previousPeriod' => $original !== null && ($original->recorded_at ?? $original->created_at)->lessThan($startsAt),
            ];
        });

        return $this->summarize($lines->all());
    }

    /** @param array<int, array<string, mixed>> $detailLines
     * @return array<string, mixed>
     */
    public function summarize(array $detailLines): array
    {
        $lines = collect($detailLines);
        $receipts = $lines->filter(fn (array $line): bool => Closing::cents($line['collectionEffect']) > 0);
        $methods = $receipts->groupBy(fn (array $line): string => $line['method'].'|'.$line['channel'])
            ->map(fn ($group): array => ['method' => $group->first()['method'], 'channel' => $group->first()['channel'], 'count' => $group->count(), 'amount' => Closing::money($group->sum(fn (array $line): int => Closing::cents($line['collectionEffect'])))])->values()->all();
        $adjustments = $lines->filter(fn (array $line): bool => in_array($line['classification'], ['correction', 'reversal'], true));
        $total = fn ($items, string $field): string => Closing::money($items->sum(fn (array $line): int => Closing::cents($line[$field])));
        $wallets = $receipts->filter(fn (array $line): bool => $line['method'] === PaymentMethod::EWallet->value || ($line['method'] === PaymentMethod::BankTransfer->value && $this->isWallet($line['channel'])));

        return [
            'transactionCount' => $lines->count(), 'paymentCount' => $receipts->count(), 'methods' => $methods,
            'actualCollectionTotal' => $total($receipts, 'collectionEffect'),
            'cashTotal' => $total($receipts->where('method', PaymentMethod::Cash->value), 'collectionEffect'),
            'bankTotal' => $total($receipts->where('method', PaymentMethod::BankTransfer->value)->filter(fn (array $line): bool => ! $this->isWallet($line['channel'])), 'collectionEffect'),
            'walletTotal' => $total($wallets, 'collectionEffect'),
            'otherTotal' => $total($receipts->whereNotIn('method', [PaymentMethod::Cash->value, PaymentMethod::BankTransfer->value, PaymentMethod::EWallet->value]), 'collectionEffect'),
            'ledgerAdjustmentsTotal' => $total($adjustments, 'ledgerEffect'),
            'previousPeriodAdjustmentsTotal' => $total($adjustments->where('previousPeriod', true), 'ledgerEffect'),
            'reversalsTotal' => $total($adjustments->where('classification', 'reversal'), 'ledgerEffect'),
            'chargesTotal' => $total($lines->where('classification', 'charge'), 'ledgerEffect'),
            'lateEntriesTotal' => $total($lines->where('classification', 'late_entry'), 'collectionEffect'),
            'refundsTotal' => $total($lines->filter(fn (array $line): bool => Closing::cents($line['collectionEffect']) < 0), 'collectionEffect'),
            'adjustments' => $adjustments->values()->all(), 'lateEntries' => $lines->where('classification', 'late_entry')->values()->all(),
            'reversals' => $adjustments->where('classification', 'reversal')->values()->all(), 'lines' => $lines->all(),
        ];
    }

    private function isWallet(?string $channel): bool
    {
        return $channel !== null && (str_contains(mb_strtolower($channel), 'pay') || str_contains($channel, 'محفظ') || str_contains($channel, 'جوال باي'));
    }

    private function collectionEffect(SubscriptionTransaction $transaction): int
    {
        if ($transaction->adjustment_type !== null) {
            return 0;
        }
        if ($transaction->type === SubscriptionTransaction::TYPE_REFUND && Closing::cents($transaction->cash_effect_amount ?? '0') < 0) {
            return Closing::cents($transaction->cash_effect_amount);
        }
        if ($transaction->isPayment()) {
            if ($transaction->cancelled_at !== null && ($transaction->status !== SubscriptionTransaction::STATUS_LINKED_CANCELLATION
                || ClosingPeriods::dayOf($transaction->cancelled_at) === ClosingPeriods::dayOf($transaction->created_at))) {
                return 0;
            }

            return -Closing::cents($transaction->amount);
        }
        if ($transaction->type === SubscriptionTransaction::TYPE_REFUND && $transaction->referenceTransaction !== null
            && ClosingPeriods::dayOf($transaction->created_at) > ClosingPeriods::dayOf($transaction->referenceTransaction->created_at)) {
            return -Closing::cents($transaction->amount);
        }

        return 0;
    }

    /**
     * Close the week. With `$early` the week under way is closed now, before
     * its scheduled cut-off, when the company allows it.
     *
     * @param  Closure(): array<string, mixed>  $summary
     */
    public function close(string $date, User $actor, Closure $summary, bool $early = false): Closing
    {
        Gate::forUser($actor)->authorize($early ? 'closeWeekEarly' : 'closeWeek', Closing::class);

        return DB::transaction(function () use ($date, $actor, $summary, $early): Closing {
            $setting = $this->lock();
            $period = $this->forDate($date);
            if ($early) {
                $this->endEarly($setting, $period, $actor);
            }
            $this->prepare($period, $actor);
            $view = $summary();

            if (! $setting->weekly_enabled || $period->status !== ClosingPeriodStatus::ReadyToClose || now()->lessThan($period->eligible_at) || ! $view['canApprove']) {
                throw ValidationException::withMessages(['period' => $view['blockers'][0] ?? 'الفترة غير جاهزة أو أُغلقت من قبل.']);
            }

            $report = $this->report($period);
            $closing = Closing::create([
                'number' => $period->number, 'type' => ClosingType::Weekly,
                'period_start' => $period->period_start, 'period_end' => $period->period_end,
                'status' => ClosingStatus::Approved, 'prepared_by' => $actor->id, 'submitted_at' => now(), 'reviewed_by' => $actor->id, 'reviewed_at' => now(),
                'snapshot' => ['view' => $view, 'report' => $report, 'cutoffAt' => $period->cutoff_at->toIso8601String(), 'startsAt' => $period->starts_at->toIso8601String(), 'timezone' => $period->timezone, 'closedBy' => $actor->name, 'closedAt' => now()->toIso8601String(),
                    ...($period->scheduled_cutoff_at ? ['scheduledCutoffAt' => $period->scheduled_cutoff_at->toIso8601String()] : [])],
            ]);
            foreach ($report['lines'] as $line) {
                $closing->snapshotLines()->create([
                    'subscription_transaction_id' => $line['transactionId'], 'classification' => $line['classification'],
                    'ledger_effect' => $line['ledgerEffect'], 'collection_effect' => $line['collectionEffect'],
                    'payment_method' => $line['method'], 'channel' => $line['channel'], 'details' => $line,
                ]);
            }
            $this->transactions($period)->whereNull('closing_period_id')->update(['closing_period_id' => $period->id]);
            $period->update(['status' => ClosingPeriodStatus::Closed, 'closing_id' => $closing->id, 'closed_at' => now(), 'closed_by' => $actor->id]);
            $closing->record($actor, 'PERIOD_CLOSED', 'اعتُمدت لقطة ثابتة: التحصيل الفعلي '.$report['actualCollectionTotal'].' ₪؛ تسويات السجل '.$report['ledgerAdjustmentsTotal'].' ₪.');

            return $closing;
        });
    }

    /**
     * End the week under way now rather than at its scheduled cut-off, and
     * start the next week at the same moment. The next week keeps the
     * schedule's own cut-off from there on, so the part of this week still
     * to come joins it instead of becoming a week of its own. Runs inside
     * the closing's transaction: if the week then cannot be closed, all of
     * it is undone.
     */
    private function endEarly(ClosingSetting $setting, ClosingPeriod $period, User $actor): void
    {
        $now = now()->toImmutable()->startOfSecond();

        if (! $setting->weekly_enabled || ! $setting->allow_early_weekly_close) {
            throw ValidationException::withMessages(['period' => 'إغلاق الأسبوع قبل موعده غير مفعّل.']);
        }

        if ($period->status !== ClosingPeriodStatus::Open || $now->lessThanOrEqualTo($period->starts_at) || $now->greaterThanOrEqualTo($period->cutoff_at)
            || ClosingPeriod::query()->where('starts_at', '>=', $period->cutoff_at)->exists()) {
            throw ValidationException::withMessages(['period' => 'لا يُغلق قبل موعده إلا الأسبوع الجاري.']);
        }

        $lastDay = max($period->period_start->toDateString(), $now->subSecond()->setTimezone($period->timezone)->toDateString());
        $following = $this->boundaries($period->period_end->addDay());

        while ($following['cutoff']->lessThanOrEqualTo($now)) {
            $following = $this->boundaries($following['last']->addDay());
        }

        $nextFirst = CarbonImmutable::parse($lastDay)->addDay();
        $scheduled = $period->cutoff_at;
        $period->update(['cutoff_at' => $now, 'eligible_at' => $now, 'period_end' => $lastDay, 'scheduled_cutoff_at' => $scheduled]);
        ClosingPeriod::query()->create([
            'number' => $this->nextNumber($nextFirst),
            'period_start' => $nextFirst->toDateString(), 'period_end' => $following['last']->toDateString(),
            'starts_at' => $now, 'cutoff_at' => $following['cutoff'],
            'eligible_at' => $following['cutoff']->addMinutes($setting->grace_period_minutes),
            'timezone' => $following['timezone'], 'status' => ClosingPeriodStatus::Open,
        ]);
        ClosingEvent::create([
            'closing_period_id' => $period->id, 'user_id' => $actor->id, 'action' => 'PERIOD_ENDED_EARLY',
            'description' => 'أُنهيت الفترة الآن قبل موعد قطعها المقرر ('.$scheduled->setTimezone($period->timezone)->format('Y-m-d H:i').') وبدأت فترة جديدة فورًا.',
        ]);
    }

    /**
     * A week's number by the ISO week its first day falls in (W-2026-40),
     * made unique when that number is already taken.
     */
    private function nextNumber(CarbonImmutable $first): string
    {
        $base = sprintf('W-%d-%02d', $first->isoWeekYear(), $first->isoWeek());
        $number = $base;
        $sequence = 1;

        while (ClosingPeriod::query()->where('number', $number)->exists() || Closing::query()->where('number', $number)->exists()) {
            $number = $base.'-'.str_pad((string) ++$sequence, 2, '0', STR_PAD_LEFT);
        }

        return $number;
    }

    public function isLocked(SubscriptionTransaction $transaction): bool
    {
        if ($transaction->closing_period_id !== null && ClosingPeriod::query()->whereKey($transaction->closing_period_id)->whereIn('status', ['closed', 'under_audit', 'audited'])->exists()) {
            return true;
        }
        $moment = $transaction->recorded_at ?? $transaction->created_at ?? now();

        return ClosingPeriod::query()->where('starts_at', '<=', $moment)->where('cutoff_at', '>', $moment)->whereIn('status', ['closed', 'under_audit', 'audited'])->exists()
            || Closing::query()->where('type', ClosingType::Weekly)->where('status', ClosingStatus::Approved)->whereDoesntHave('period')
                ->whereDate('period_start', '<=', ClosingPeriods::dayOf($moment))->whereDate('period_end', '>=', ClosingPeriods::dayOf($moment))->exists();
    }
}
