<?php

namespace App\Support;

use App\Enums\CashBoxType;
use App\Enums\ClosingStatus;
use App\Enums\PaymentMethod;
use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Models\AuditNote;
use App\Models\Branch;
use App\Models\CashBox;
use App\Models\CashBoxPayment;
use App\Models\CashBoxSync;
use App\Models\CashTransfer;
use App\Models\Closing;
use App\Models\ClosingAdjustment;
use App\Models\ClosingPayment;
use App\Models\ClosingSetting;
use App\Models\ClosingSettingChange;
use App\Models\ClosingVersion;
use App\Models\CollectorDebt;
use App\Models\DebtRepayment;
use App\Models\MobileAccessToken;
use App\Models\SafeCount;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Notifications\BranchClosingNotification;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** Branch sessions and packages are separate from historical company closings. */
class BranchClosingWorkflow
{
    public const CURRENCIES = ['ILS', 'USD', 'JOD'];

    public function locked(int $branchId, callable $operation): mixed
    {
        return DB::transaction(function () use ($branchId, $operation): mixed {
            Branch::query()->whereKey($branchId)->lockForUpdate()->firstOrFail();

            return $operation();
        }, 3);
    }

    public function start(int $branchId, User $actor): void
    {
        $this->locked($branchId, function () use ($branchId, $actor): void {
            $setting = ClosingSetting::ownFor($branchId);
            $this->require(! $setting?->workflow_started_at, 'تم بدء إغلاق الفرع بالفعل.');
            $defaults = ClosingSetting::forBranch($branchId);
            $setting ??= new ClosingSetting(['branch_id' => $branchId]);
            $setting->fill(['week_starts_on' => $defaults->week_starts_on, 'cutoff_time' => $defaults->cutoff_time, 'auto_open' => true, 'frequency' => 'weekly', 'arrangement' => 'combined', 'workflow_started_at' => now(), 'updated_by' => $actor->id]);
            $setting->save();
            $settings = $this->settings($setting);
            $end = $this->nextEnd(CarbonImmutable::now()->utc(), $settings);
            $start = $end->setTimezone(config('app.business_timezone'))->subWeek()->utc();
            $this->createPeriod($branchId, $start, $end, $settings);
            $this->refresh($branchId);
        });
    }

    /** @return array{frequency: string, arrangement: string, week_starts_on: int, cutoff_time: string} */
    public function settings(ClosingSetting $setting): array
    {
        return ['frequency' => $setting->frequency, 'arrangement' => $setting->arrangement, 'week_starts_on' => $setting->week_starts_on, 'cutoff_time' => $setting->cutoff()];
    }

    /** @param array<string, mixed> $settings */
    public function nextEnd(CarbonImmutable $from, array $settings): CarbonImmutable
    {
        $local = $from->setTimezone(config('app.business_timezone'));
        $end = $local->setTimeFromTimeString($settings['cutoff_time']);
        if ($settings['frequency'] === 'weekly') {
            $end = $end->addDays(((int) $settings['week_starts_on'] - $end->dayOfWeek + 7) % 7);
        }
        if ($end->lessThanOrEqualTo($local)) {
            $end = $settings['frequency'] === 'weekly' ? $end->addWeek() : $end->addDay();
        }

        return $end->utc();
    }

    /** @param array<string, mixed> $settings */
    private function createPeriod(int $branchId, CarbonImmutable $from, CarbonImmutable $until, array $settings): Closing
    {
        $primary = null;
        foreach ($settings['arrangement'] === 'separate' ? ['cash', 'bank'] : ['combined'] as $book) {
            $closing = Closing::query()->firstOrCreate(['branch_id' => $branchId, 'coverage_from' => $from, 'book' => $book], [
                'number' => 'BR-'.Str::ulid(), 'type' => $settings['frequency'], 'period_start' => $from->setTimezone(config('app.business_timezone'))->toDateString(), 'period_end' => $until->subSecond()->setTimezone(config('app.business_timezone'))->toDateString(),
                'coverage_until' => $until, 'scheduled_until' => $until, 'status' => ClosingStatus::Draft, 'workflow_settings' => $settings,
            ]);
            $primary ??= $closing;
        }

        return $primary;
    }

    public function current(int $branchId, ?string $book = null): Closing
    {
        return Closing::query()->where('branch_id', $branchId)->whereNotNull('workflow_settings')
            ->where('coverage_from', '<=', now())->where('coverage_until', '>', now())
            ->when($book, fn ($query) => $query->whereIn('book', [$book, 'combined']))
            ->orderByDesc('coverage_from')->orderBy('id')->firstOrFail();
    }

    public function refresh(int $branchId): void
    {
        $this->locked($branchId, function () use ($branchId): void {
            $setting = ClosingSetting::ownFor($branchId);
            if (! $setting?->workflow_started_at) {
                return;
            }
            $latest = Closing::query()->where('branch_id', $branchId)->whereNotNull('workflow_settings')->orderByDesc('coverage_until')->orderBy('id')->firstOrFail();
            while ($latest->coverage_until->lessThanOrEqualTo(now())) {
                $this->closePeriodBoxes($latest, $latest->coverage_until, 'cutoff');
                $change = ClosingSettingChange::query()->where('branch_id', $branchId)->whereNull('applied_at')->where('effective_from', '<=', $latest->coverage_until)->latest('id')->first();
                $settings = $latest->workflow_settings;
                unset($settings['continuation']);
                if ($change) {
                    $settings = $change->settings;
                    $setting->update([...$settings, 'updated_by' => $change->user_id]);
                    ClosingSettingChange::query()->where('branch_id', $branchId)->whereNull('applied_at')->where('effective_from', '<=', $latest->coverage_until)->update(['applied_at' => now()]);
                }
                $until = $latest->scheduled_until->greaterThan($latest->coverage_until) ? $latest->scheduled_until : $this->nextEnd($latest->coverage_until, $settings);
                $latest = $this->createPeriod($branchId, $latest->coverage_until, $until, $settings);
            }
            SubscriptionTransaction::query()->where('branch_id', $branchId)->whereIn('type', [SubscriptionTransaction::TYPE_PAYMENT, SubscriptionTransaction::TYPE_CLEARING])
                ->where('status', SubscriptionTransaction::STATUS_ACTIVE)->where('created_at', '>=', $setting->workflow_started_at)
                ->whereNotIn('id', CashBoxPayment::query()->select('subscription_transaction_id'))->orderBy('id')
                ->chunkById(200, function ($payments): void {
                    foreach ($payments as $payment) {
                        $this->attachEntry($payment);
                    }
                });
            foreach (CashBox::query()->where('branch_id', $branchId)->where('status', 'open')->with('user')->get() as $box) {
                if ($box->user && (! $box->user->is_active || $box->user->branch_id !== $branchId)) {
                    $this->close($box, 'departure', now()->toImmutable()->utc());
                }
            }
        });
    }

    public function capture(SubscriptionTransaction $payment): void
    {
        if (! in_array($payment->type, [SubscriptionTransaction::TYPE_PAYMENT, SubscriptionTransaction::TYPE_CLEARING], true) || ! ClosingSetting::ownFor($payment->branch_id)?->workflow_started_at) {
            return;
        }
        $this->refresh($payment->branch_id);
    }

    private function openBox(Closing $closing, ?int $userId, CashBoxType $type): CashBox
    {
        $key = $closing->branch_id.':'.($userId ?? 'direct').':'.$type->value;

        return CashBox::query()->firstOrCreate(['open_key' => $key], ['number' => 'BOX-'.Str::ulid(), 'branch_id' => $closing->branch_id, 'user_id' => $userId, 'kind' => $userId ? 'staff' : 'direct', 'type' => $type, 'closing_id' => $closing->id, 'opened_at' => now(), 'status' => 'open']);
    }

    private function entryMethod(SubscriptionTransaction $transaction): string
    {
        return $transaction->isClearing() ? 'clearing' : $transaction->payment_method->value;
    }

    private function attachEntry(SubscriptionTransaction $payment, ?CarbonImmutable $originalTime = null): void
    {
        $type = CashBoxType::for($payment);
        $occurred = ($originalTime ?? $payment->created_at->toImmutable())->utc();
        $closing = Closing::query()->where('branch_id', $payment->branch_id)->whereNotNull('workflow_settings')->where('coverage_from', '<=', $occurred)->where('coverage_until', '>', $occurred)->whereIn('book', [$type->book(), 'combined'])->orderBy('id')->first();
        $late = $closing?->submitted_snapshot !== null;
        if (! $closing || $late) {
            $closing = $this->current($payment->branch_id);
        } elseif ($closing->book === 'bank') {
            $closing = Closing::query()->where('branch_id', $payment->branch_id)->where('coverage_from', $closing->coverage_from)->where('book', 'cash')->firstOrFail();
        }
        $userId = $payment->recorded_by;
        $box = $closing->coverage_until->lessThanOrEqualTo(now())
            ? CashBox::query()->create(['number' => 'BOX-'.Str::ulid(), 'branch_id' => $closing->branch_id, 'user_id' => $userId, 'type' => $type, 'closing_id' => $closing->id, 'opened_at' => $occurred, 'closed_at' => $closing->coverage_until, 'close_reason' => 'late_sync', 'status' => 'pending'])
            : $this->openBox($closing, $userId, $type);
        $box->payments()->create(['subscription_transaction_id' => $payment->id, 'currency' => $payment->currency?->value ?? 'ILS', 'amount' => $payment->currency_amount ?? abs((float) $payment->amount), 'method' => $this->entryMethod($payment), 'status' => $type === CashBoxType::Cash ? 'cash' : 'pending', 'occurred_at' => $occurred, 'synced_at' => now(), 'is_late' => $late]);
        if ($box->status !== 'open') {
            $box->update(['expected_counts' => $this->expected($box)]);
        }
    }

    public function syncOriginalTime(SubscriptionTransaction $payment, CarbonImmutable $occurred): void
    {
        if (! ClosingSetting::ownFor($payment->branch_id)?->workflow_started_at) {
            return;
        }
        $this->locked($payment->branch_id, function () use ($payment, $occurred): void {
            $entry = CashBoxPayment::query()->where('subscription_transaction_id', $payment->id)->first();
            $this->require($entry && $entry->box->status === 'open' && $entry->status !== 'confirmed', 'لا يمكن إعادة توزيع دفعة بعد إغلاق صندوقها أو تأكيدها.');
            $entry->delete();
            $this->attachEntry($payment, $occurred);
        });
    }

    public function syncEditablePayment(SubscriptionTransaction $payment): void
    {
        if (! ClosingSetting::ownFor($payment->branch_id)?->workflow_started_at) {
            return;
        }
        $entry = CashBoxPayment::query()->where('subscription_transaction_id', $payment->id)->first();
        if (! $entry || $entry->box->status !== 'open') {
            return;
        }
        if (CashBoxType::for($payment) !== $entry->box->type) {
            $occurred = $entry->occurred_at;
            $entry->delete();
            $this->attachEntry($payment, $occurred);

            return;
        }
        $methodChanged = $entry->method !== $this->entryMethod($payment);
        $entry->update([
            'currency' => $payment->currency?->value ?? 'ILS',
            'amount' => $payment->currency_amount ?? abs((float) $payment->amount),
            'method' => $this->entryMethod($payment),
            ...($methodChanged ? ['status' => $payment->payment_method === PaymentMethod::Cash ? 'cash' : 'pending', 'confirmed_by' => null, 'confirmed_at' => null, 'confirmed_in_closing_id' => null] : []),
        ]);
    }

    public function releaseEditablePayment(SubscriptionTransaction $payment): void
    {
        if (! ClosingSetting::ownFor($payment->branch_id)?->workflow_started_at) {
            return;
        }
        $entry = CashBoxPayment::query()->where('subscription_transaction_id', $payment->id)->first();
        if ($entry) {
            $this->require($entry->box->status === 'open', 'الدفعة مرتبطة بصندوق مغلق؛ استخدم الإرجاع أو قيد التصحيح.');
            $entry->delete();
        }
    }

    /** @return array<string, string> */
    public function expected(CashBox $box): array
    {
        $payments = $box->payments()->where('method', 'cash')->whereHas('transaction', fn ($query) => $query->where('status', SubscriptionTransaction::STATUS_ACTIVE))->get();

        return collect(self::CURRENCIES)->mapWithKeys(fn (string $currency): array => [$currency => Closing::money($payments->where('currency', $currency)->sum(fn ($payment): int => Closing::cents($payment->amount)))])->all();
    }

    private function close(CashBox $box, string $reason, CarbonImmutable $at): void
    {
        $box->update(['status' => 'pending', 'closed_at' => $at, 'close_reason' => $reason, 'open_key' => null, 'expected_counts' => $this->expected($box)]);
        if ($box->kind === 'direct') {
            $box->update(['collector_submitted_at' => $at]);
        }
        if ($box->kind === 'direct' && ! $box->payments()->where('status', 'pending')->exists()) {
            $box->update(['status' => 'received', 'received_at' => $at, 'confirmed_at' => $at, 'head_counts' => array_fill_keys(self::CURRENCIES, '0.00')]);
        }
    }

    private function closePeriodBoxes(Closing $closing, CarbonImmutable $at, string $reason): void
    {
        foreach (CashBox::query()->where('branch_id', $closing->branch_id)->where('status', 'open')->where('opened_at', '<', $at)->get() as $box) {
            if ($box->kind === 'direct' && $reason !== 'cutoff') {
                continue;
            }
            if ($box->payments()->exists()) {
                $this->close($box, $reason, $at);
            } else {
                $box->update(['closing_id' => $closing->id, 'opened_at' => $at]);
                $box->delete();
            }
        }
    }

    /** @param array<string, mixed> $data */
    public function closeByCollector(CashBox $box, User $actor, array $data): void
    {
        $this->require($actor->is_active && $box->user_id === $actor->id && $box->branch_id === $actor->branch_id && $box->kind !== 'direct', 'لا يمكنك إغلاق هذا الصندوق.');
        $this->require($box->status === 'open' && $box->payments()->exists(), 'لا يمكن إغلاق صندوق فارغ أو مغلق.');
        $this->recordCollectorSubmission($box, $data);
        $this->close($box, 'manual', now()->toImmutable()->utc());
        $this->openBox($this->current($box->branch_id), $actor->id, $box->type);
    }

    /** @param array<string, mixed> $data */
    public function countCollector(CashBox $box, User $actor, array $data): void
    {
        $this->require($actor->is_active && $box->branch_id === $actor->branch_id && $box->user_id === $actor->id && $box->kind !== 'direct' && $box->status === 'pending' && ! $box->collector_submitted_at, 'العدّ محفوظ أو الصندوق غير متاح.');
        $this->recordCollectorSubmission($box, $data, $this->expected($box));
    }

    /** @param array<string, mixed> $data @param array<string, string>|null $expected */
    private function recordCollectorSubmission(CashBox $box, array $data, ?array $expected = null): void
    {
        if ($box->type->isCounted()) {
            $this->require(isset($data['counts']), 'يلزم عدّ النقد قبل إرسال الصندوق.');
            $difference = $this->differences($data['counts'], $expected ?? $this->expected($box));
            $this->require(! $this->hasDifference($difference) || filled($data['reason'] ?? null), 'اكتب سبب فرق العدّ قبل إغلاق الصندوق.');
            $box->update(['collector_counts' => $data['counts'], 'reason' => $data['reason'] ?? null]);
        } else {
            $this->require(in_array($data['reviewed'] ?? null, [true, 1, '1', 'yes', 'on', 'true'], true), 'راجع قائمة الحركات قبل إرسال الصندوق.');
        }
        $box->update(['collector_submitted_at' => now()]);
    }

    /** @param array<string, mixed> $data */
    public function countHead(CashBox $box, User $actor, array $data): void
    {
        $this->require($box->type->isCounted() && $box->status === 'pending' && $box->user_id !== $actor->id && ! $box->head_counts && ! $this->awaitsCollector($box), 'لا يمكنك استلام صندوقك أو إعادة عدّ صندوق مقفل؛ يلزم عدّ المحصّل أولًا.');
        $box->update(['head_counts' => $data['counts'], 'received_by' => $actor->id]);
    }

    /** @param array<string, mixed> $data */
    public function receive(CashBox $box, User $actor, array $data): void
    {
        $this->require(! $this->awaitsCollector($box), 'الصندوق لم يُرسل بعد.');
        if (! $box->type->isCounted()) {
            $this->require($box->status === 'pending' && $box->user_id !== $actor->id, 'الصندوق لم يُرسل بعد، ولا أحد يستلم صندوقه.');
            $this->require(! $box->payments()->where('status', 'pending')->whereHas('transaction', fn ($query) => $query->where('status', SubscriptionTransaction::STATUS_ACTIVE))->exists(), 'راجع كل حركات الصندوق قبل استلامه.');
            $box->update(['status' => 'received', 'received_by' => $actor->id, 'received_at' => now(), 'confirmed_at' => now()]);
            $box->user?->notify(new BranchClosingNotification('تم استلام صندوقك.', $box->number));

            return;
        }
        $this->require($box->status === 'pending' && $box->user_id !== $actor->id && $box->head_counts !== null && $box->received_by === $actor->id, 'يلزم عدّ أعمى من المستلم أولًا، ولا أحد يستلم صندوقه.');
        $this->require($box->collector_counts === null || ! $this->hasDifference($this->differences($box->head_counts, $box->collector_counts)) || ($data['recounted'] ?? false), 'أكّد إعادة العدّ مع المحصّل لاختلاف العدّين.');
        $differences = $this->differences($box->head_counts, $box->expected_counts);
        foreach ($differences as $currency => $amount) {
            if (Closing::cents($amount) === 0) {
                continue;
            }
            $this->require(filled($data['reason'] ?? $box->reason) && in_array($data['decisions'][$currency] ?? null, ['accepted', 'debt'], true), 'حدّد السبب وقرار كل فرق.');
            if (Closing::cents($amount) < 0 && $data['decisions'][$currency] === 'debt') {
                CollectorDebt::query()->create(['cash_box_id' => $box->id, 'branch_id' => $box->branch_id, 'user_id' => $box->user_id, 'currency' => $currency, 'amount' => Closing::money(-Closing::cents($amount)), 'remaining' => Closing::money(-Closing::cents($amount))]);
            }
        }
        $box->update(['status' => 'received', 'received_at' => now(), 'decisions' => $data['decisions'] ?? [], 'reason' => $data['reason'] ?? $box->reason, 'confirmed_at' => $this->ownerCanAct($box) ? null : now()]);
        $box->user?->notify(new BranchClosingNotification('تم استلام صندوقك؛ أكّد التسليم.', $box->number, ['counts' => $box->head_counts]));
    }

    /**
     * Whether the box still waits on its owner to count or review it and send
     * it to the branch. A box whose owner can no longer do that (they were
     * deactivated, moved to another branch or lost the permission) waits on
     * no one: the branch counts or reviews it without them.
     */
    public function awaitsCollector(CashBox $box): bool
    {
        return $box->kind !== 'direct' && $box->collector_submitted_at === null && $this->ownerCanAct($box);
    }

    /**
     * Whether the box's owner can still act on it themselves.
     */
    private function ownerCanAct(CashBox $box): bool
    {
        $owner = $box->user;

        return $owner !== null && $owner->is_active && $owner->branch_id === $box->branch_id && $owner->can('viewOwnCashBoxes', Subscription::class);
    }

    public function confirmBox(CashBox $box, User $actor): void
    {
        $this->require($box->type->isCounted() && $actor->id === $box->user_id && $box->status === 'received' && ! $box->confirmed_at, 'التأكيد متاح لصاحب الصندوق بعد الاستلام فقط.');
        $box->update(['confirmed_at' => now()]);
    }

    /** @param array<string, mixed> $data */
    public function transfer(int $branchId, User $actor, array $data, string $proof): void
    {
        $this->require((int) $data['recipient_id'] !== $actor->id, 'لا يمكنك تسليم الكاش لنفسك.');
        $this->require(Closing::cents($data['amount']) <= Closing::cents($this->balance($branchId)[$data['currency']]), 'المبلغ أكبر من رصيد الخزنة بهذه العملة.');
        CashTransfer::query()->create(['closing_id' => $this->current($branchId, 'cash')->id, 'branch_id' => $branchId, 'currency' => $data['currency'], 'amount' => $data['amount'], 'method' => $data['method'], 'sent_by' => $actor->id, 'recipient_id' => $data['recipient_id'], 'sent_at' => now(), 'proof_path' => $proof, 'status' => 'in_transit']);
    }

    public function repay(CollectorDebt $debt, User $actor, string $amount): void
    {
        $this->require(Closing::cents($amount) <= Closing::cents($debt->remaining), 'المبلغ أكبر من الدين المتبقي.');
        $this->require($debt->user_id !== $actor->id, 'لا يمكنك استلام تسديد دينك بنفسك.');
        DebtRepayment::query()->create(['collector_debt_id' => $debt->id, 'closing_id' => $this->current($debt->branch_id, 'cash')->id, 'received_by' => $actor->id, 'amount' => $amount]);
        $debt->update(['remaining' => Closing::money(Closing::cents($debt->remaining) - Closing::cents($amount))]);
    }

    public function reviewEntry(CashBoxPayment $payment, User $actor, string $status): void
    {
        $allowed = $payment->method === 'clearing' ? ['confirmed', 'rejected'] : ['confirmed', 'missing'];
        $this->require($payment->method !== 'cash' && in_array($status, $allowed, true) && $payment->status !== 'confirmed', 'لا يمكن تغيير دفعة مؤكدة.');
        $this->require($payment->box->user_id !== $actor->id, 'لا يمكنك مراجعة حركات صندوقك.');
        $this->require(! $this->awaitsCollector($payment->box), 'الصندوق لم يُرسل بعد.');
        $this->require($payment->transaction->status === SubscriptionTransaction::STATUS_ACTIVE, 'الدفعة ملغاة أو مُرجعة.');
        $original = Closing::query()->where('branch_id', $payment->box->branch_id)->where('coverage_from', $payment->box->closing->coverage_from)->whereIn('book', ['combined', 'bank'])->firstOrFail();
        $closing = ! $original->submitted_snapshot && ! in_array($payment->status, ['missing', 'rejected'], true) ? $original : $this->current($payment->box->branch_id, 'bank');
        $payment->update(['status' => $status, 'confirmed_by' => $actor->id, 'confirmed_at' => $status === 'confirmed' ? now() : null, 'confirmed_in_closing_id' => $status === 'confirmed' ? $closing->id : null]);
        $box = $payment->box;
        if (in_array($status, ['missing', 'rejected'], true)) {
            foreach (User::query()->where('is_active', true)->get()->filter(fn (User $user): bool => BranchClosingAccess::manage($user, $box->branch_id)) as $admin) {
                $admin->notify(new BranchClosingNotification('حركة مرفوضة تحتاج مراجعة الفرع.', $box->number, ['entry_id' => $payment->id, 'status' => $status]));
            }
        }
        if ($box->kind === 'direct' && $box->status === 'pending' && ! $box->payments()->where('status', 'pending')->exists()) {
            $box->update(['status' => 'received', 'received_by' => $actor->id, 'received_at' => now(), 'confirmed_at' => now(), 'head_counts' => array_fill_keys(self::CURRENCIES, '0.00')]);
        }
    }

    public function direct(CashBoxPayment $payment): void
    {
        $this->require(! in_array($payment->method, ['cash', 'clearing'], true) && $payment->box->status === 'open' && $payment->status === 'pending', 'الدفعات المباشرة متاحة للدفعات الإلكترونية في صندوق مفتوح فقط.');
        $box = $this->openBox($this->current($payment->box->branch_id), null, CashBoxType::BankTransfer);
        $payment->update(['cash_box_id' => $box->id]);
    }

    /** @return array<string, mixed> */
    public function reviewSummary(Closing $closing): array
    {
        $snapshot = $closing->submitted_snapshot ?? $this->snapshot($closing);
        $cash = array_fill_keys(self::CURRENCIES, 0);
        $bank = array_fill_keys(self::CURRENCIES, 0);
        $clearing = array_fill_keys(self::CURRENCIES, 0);
        foreach ($snapshot['boxes'] as $box) {
            if ($box['status'] === 'received' && ($box['type'] ?? 'cash') === 'cash') {
                foreach ($box['head_counts'] ?? [] as $currency => $amount) {
                    $cash[$currency] += Closing::cents($amount);
                }
            }
        }
        foreach ($snapshot['electronic'] as $payment) {
            if ($payment['status'] === 'confirmed' && $payment['confirmed_in_closing_id'] === $closing->id && ($payment['transaction']['status'] ?? SubscriptionTransaction::STATUS_ACTIVE) === SubscriptionTransaction::STATUS_ACTIVE) {
                $bank[$payment['currency']] += Closing::cents($payment['amount']);
            }
        }
        foreach ($snapshot['clearings'] ?? [] as $entry) {
            if ($entry['status'] === 'confirmed' && $entry['confirmed_in_closing_id'] === $closing->id && ($entry['transaction']['status'] ?? SubscriptionTransaction::STATUS_ACTIVE) === SubscriptionTransaction::STATUS_ACTIVE) {
                $clearing[$entry['currency']] += Closing::cents($entry['amount']);
            }
        }

        return [
            'cash' => array_map(Closing::money(...), $cash),
            'bank' => array_map(Closing::money(...), $bank),
            'clearing' => array_map(Closing::money(...), $clearing),
            'rejectedClearings' => collect($snapshot['clearings'] ?? [])->where('status', 'rejected')->count(),
            'pendingElectronic' => collect($snapshot['electronic'])->where('status', 'pending')->count(),
            'missingElectronic' => collect($snapshot['electronic'])->where('status', 'missing')->count(),
            'inTransit' => collect($snapshot['transfers'])->where('status', 'in_transit')->count(),
            'unsyncedCollectors' => $snapshot['unsyncedCollectors'] ?? [],
            'cashLedger' => $snapshot['cashLedger'] ?? null,
        ];
    }

    /** @return array<string, string> */
    public function balance(int $branchId): array
    {
        $totals = array_fill_keys(self::CURRENCIES, 0);
        foreach (CashBox::query()->where('branch_id', $branchId)->where('type', CashBoxType::Cash)->where('status', 'received')->get() as $box) {
            foreach ($box->head_counts ?? [] as $currency => $amount) {
                $totals[$currency] += Closing::cents($amount);
            }
        }
        foreach (DebtRepayment::query()->whereHas('debt', fn ($query) => $query->where('branch_id', $branchId))->with('debt')->get() as $repayment) {
            $totals[$repayment->debt->currency] += Closing::cents($repayment->amount);
        }
        foreach (CashTransfer::query()->where('branch_id', $branchId)->whereHas('closing', fn ($query) => $query->whereNotNull('workflow_settings'))->get() as $transfer) {
            $totals[$transfer->currency] -= Closing::cents($transfer->amount);
        }
        foreach (ClosingAdjustment::query()->where('book', 'cash')->whereIn('closing_id', Closing::query()->where('branch_id', $branchId)->select('id'))->get() as $adjustment) {
            $totals[$adjustment->currency] += Closing::cents($adjustment->amount);
        }
        foreach (SafeCount::query()->whereIn('closing_id', Closing::query()->where('branch_id', $branchId)->select('id'))->get() as $count) {
            foreach ($count->differences as $currency => $amount) {
                $totals[$currency] += Closing::cents($amount);
            }
        }

        return array_map(fn (int $amount): string => Closing::money($amount), $totals);
    }

    /** @return array<string, array<string, string>> */
    public function cashLedger(Closing $closing): array
    {
        $rows = array_fill_keys(['opening', 'received', 'repayments', 'sent', 'adjustments', 'safeDifference', 'afterCutoff'], array_fill_keys(self::CURRENCIES, 0));
        $add = function (Closing $period, string $kind, string $currency, string $amount) use ($closing, &$rows): void {
            $column = $period->coverage_from->lessThan($closing->coverage_from) ? 'opening' : ($period->coverage_from->greaterThan($closing->coverage_from) ? 'afterCutoff' : $kind);
            $rows[$column][$currency] += Closing::cents($amount) * ($kind === 'sent' ? -1 : 1);
        };
        foreach (CashBox::query()->where('branch_id', $closing->branch_id)->where('type', CashBoxType::Cash)->where('status', 'received')->with('closing')->get() as $box) {
            foreach ($box->head_counts ?? [] as $currency => $amount) {
                $add($box->closing, 'received', $currency, (string) $amount);
            }
        }
        foreach (DebtRepayment::query()->whereHas('debt', fn ($query) => $query->where('branch_id', $closing->branch_id))->with(['debt', 'closing'])->get() as $repayment) {
            $add($repayment->closing, 'repayments', $repayment->debt->currency, $repayment->amount);
        }
        foreach (CashTransfer::query()->where('branch_id', $closing->branch_id)->whereHas('closing', fn ($query) => $query->whereNotNull('workflow_settings'))->with('closing')->get() as $transfer) {
            $add($transfer->closing, 'sent', $transfer->currency, $transfer->amount);
        }
        foreach (ClosingAdjustment::query()->where('book', 'cash')->whereHas('closing', fn ($query) => $query->where('branch_id', $closing->branch_id))->with('closing')->get() as $adjustment) {
            $add($adjustment->closing, 'adjustments', $adjustment->currency, $adjustment->amount);
        }
        foreach (SafeCount::query()->whereHas('closing', fn ($query) => $query->where('branch_id', $closing->branch_id))->with('closing')->get() as $count) {
            foreach ($count->differences as $currency => $amount) {
                $add($count->closing, 'safeDifference', $currency, (string) $amount);
            }
        }
        $rows['remaining'] = array_fill_keys(self::CURRENCIES, 0);
        $rows['actualNow'] = array_fill_keys(self::CURRENCIES, 0);
        foreach (self::CURRENCIES as $currency) {
            foreach (['opening', 'received', 'repayments', 'sent', 'adjustments', 'safeDifference'] as $column) {
                $rows['remaining'][$currency] += $rows[$column][$currency];
            }
            $rows['actualNow'][$currency] = $rows['remaining'][$currency] + $rows['afterCutoff'][$currency];
        }

        return array_map(fn (array $amounts): array => array_map(Closing::money(...), $amounts), $rows);
    }

    /** @param array<string, mixed> $data */
    public function safeCount(Closing $closing, User $actor, array $data): void
    {
        $this->editableEnded($closing);
        $this->require($closing->book !== 'bank' && ! SafeCount::query()->where('closing_id', $closing->id)->exists(), 'الجرد محفوظ أو هذا إغلاق بنك.');
        $periodIds = Closing::query()->where('branch_id', $closing->branch_id)->where('coverage_from', $closing->coverage_from)->pluck('id');
        $this->require(! CashBox::query()->whereIn('closing_id', $periodIds)->where('type', CashBoxType::Cash)->where('status', '!=', 'received')->exists(), 'استلم الصناديق قبل جرد الخزنة.');
        $expected = $this->balance($closing->branch_id);
        $diff = $this->differences($data['counts'], $expected);
        $this->require(! $this->hasDifference($diff) || filled($data['reason'] ?? null), 'اكتب سبب فرق جرد الخزنة.');
        SafeCount::query()->create(['closing_id' => $closing->id, 'user_id' => $actor->id, 'counts' => $data['counts'], 'expected' => $expected, 'differences' => $diff, 'reason' => $data['reason'] ?? null]);
    }

    /** @return array<int, string> */
    public function blockers(Closing $closing): array
    {
        $blockers = [];
        if ($closing->coverage_until->greaterThan(now())) {
            $blockers[] = 'لم يصل وقت القطع بعد.';
        }
        if (Closing::query()->where('branch_id', $closing->branch_id)->whereNotNull('workflow_settings')->where('coverage_from', '<', $closing->coverage_from)->whereIn('book', [$closing->book, 'combined', ...($closing->book === 'combined' ? ['cash', 'bank'] : [])])->whereNull('submitted_at')->exists()) {
            $blockers[] = 'أرسل الإغلاق السابق أولًا.';
        }
        $periodIds = Closing::query()->where('branch_id', $closing->branch_id)->where('coverage_from', $closing->coverage_from)->pluck('id');
        if (CashBox::query()->whereIn('closing_id', $periodIds)->where('kind', '!=', 'direct')->whereIn('type', CashBoxType::forBook($closing->book))->where(fn ($query) => $query->where('status', '!=', 'received')->orWhereNull('confirmed_at'))->exists()) {
            $blockers[] = 'يوجد صندوق لم يُستلم أو لم يؤكّد صاحبه التسليم.';
        }
        if ($closing->book !== 'bank') {
            if (! SafeCount::query()->where('closing_id', $closing->id)->exists()) {
                $blockers[] = 'جرد الخزنة لم يتم.';
            }
            if ($closing->transfers()->whereNull('proof_path')->exists()) {
                $blockers[] = 'يوجد تسليم للشركة بلا صورة إثبات.';
            }
        }

        return $blockers;
    }

    /** @return array<string, mixed> */
    public function snapshot(Closing $closing): array
    {
        $periodIds = Closing::query()->where('branch_id', $closing->branch_id)->where('coverage_from', $closing->coverage_from)->pluck('id');
        $boxes = CashBox::query()->whereIn('closing_id', $periodIds)->with(['user:id,name', 'payments'])->get();
        $electronic = CashBoxPayment::query()->where('method', '!=', 'cash')->where(fn ($query) => $query->whereIn('cash_box_id', $boxes->modelKeys())->orWhere('confirmed_in_closing_id', $closing->id))->with('transaction:id,reference_number,bank_name,notes,status')->get();
        $syncs = CashBoxSync::query()->where('branch_id', $closing->branch_id)->get()->keyBy('user_id');

        return [
            'number' => $closing->number, 'book' => $closing->book, 'from' => $closing->coverage_from->toIso8601String(), 'until' => $closing->coverage_until->toIso8601String(),
            'boxes' => $boxes->filter(fn (CashBox $box): bool => in_array($box->type->value, CashBoxType::forBook($closing->book), true))->values()->toArray(),
            'electronic' => $closing->book === 'cash' ? [] : $electronic->where('method', '!=', 'clearing')->values()->toArray(),
            'clearings' => $closing->book === 'cash' ? [] : $electronic->where('method', 'clearing')->values()->toArray(),
            'transfers' => $closing->book === 'bank' ? [] : $closing->transfers()->with('recipient:id,name')->get()->toArray(),
            'safeCount' => SafeCount::query()->where('closing_id', $closing->id)->first()?->toArray(),
            'debts' => $closing->book === 'bank' ? [] : CollectorDebt::query()->whereIn('cash_box_id', $boxes->modelKeys())->get()->toArray(),
            'repayments' => DebtRepayment::query()->where('closing_id', $closing->id)->get()->toArray(),
            'adjustments' => ClosingAdjustment::query()->where('closing_id', $closing->id)->get()->toArray(),
            'safeBalanceAtSubmission' => $closing->book === 'bank' ? null : $this->balance($closing->branch_id),
            'cashLedger' => $closing->book === 'bank' ? null : $this->cashLedger($closing),
            'unsyncedCollectors' => User::query()->where('branch_id', $closing->branch_id)->where('is_active', true)
                ->where(fn ($query) => $query->where('role', UserRole::Collector)->orWhereIn('id', MobileAccessToken::query()->select('user_id')))->with('permissions')->get()->filter(fn (User $user): bool => $user->hasPermission(PermissionKey::RecordCollections))->filter(function (User $collector) use ($closing, $syncs): bool {
                    $sync = $syncs->get($collector->id);

                    return ! $sync || $sync->pending_payments > 0 || $sync->synced_at->lessThan($closing->coverage_until);
                })->map(fn (User $collector): array => ['id' => $collector->id, 'name' => $collector->name])->values()->all(),
        ];
    }

    public function submit(Closing $closing, User $actor, ?string $notes): void
    {
        $this->editableEnded($closing);
        $blockers = $this->blockers($closing);
        $this->require($blockers === [], implode(' ', $blockers));
        $snapshot = $this->snapshot($closing);
        $version = (int) ClosingVersion::query()->where('closing_id', $closing->id)->max('version') + 1;
        ClosingVersion::query()->create(['closing_id' => $closing->id, 'version' => $version, 'snapshot' => $snapshot, 'user_id' => $actor->id, 'notes' => $notes]);
        $closing->update(['status' => ClosingStatus::Submitted, 'branch_approved_by' => $actor->id, 'branch_approved_at' => now(), 'branch_notes' => $notes, 'submitted_at' => now(), 'submitted_snapshot' => $snapshot]);
        $periodIds = Closing::query()->where('branch_id', $closing->branch_id)->where('coverage_from', $closing->coverage_from)->pluck('id');
        $payments = CashBoxPayment::query()->where(fn ($query) => $query->whereHas('box', fn ($boxes) => $boxes->whereIn('closing_id', $periodIds))->orWhere('confirmed_in_closing_id', $closing->id))
            ->when($closing->book === 'cash', fn ($query) => $query->where('method', 'cash'))
            ->when($closing->book === 'bank', fn ($query) => $query->where('method', '!=', 'cash'))->get();
        foreach ($payments as $payment) {
            ClosingPayment::query()->firstOrCreate(['subscription_transaction_id' => $payment->subscription_transaction_id], ['closing_id' => $closing->id]);
        }
        $closing->events()->create(['user_id' => $actor->id, 'action' => 'branch_submitted', 'description' => 'أُرسلت النسخة '.$version]);
        foreach (User::query()->where('is_active', true)->where('role', UserRole::FinancialAuditor)->get() as $auditor) {
            $auditor->notify(new BranchClosingNotification('إغلاق فرع بانتظار التدقيق', $closing->number));
        }
    }

    public function withdraw(Closing $closing, User $actor): void
    {
        $this->require($closing->status === ClosingStatus::Submitted && ! $closing->reviewed_at && ! $closing->reviewed_by && ! AuditNote::query()->where('closing_id', $closing->id)->exists(), 'لا يمكن السحب بعد فتح التدقيق للإغلاق.');
        ClosingVersion::query()->where('closing_id', $closing->id)->whereNull('withdrawn_at')->update(['withdrawn_at' => now()]);
        $closing->lines()->delete();
        $closing->update(['status' => ClosingStatus::Draft, 'submitted_snapshot' => null, 'submitted_at' => null, 'branch_approved_at' => null, 'branch_approved_by' => null]);
        $closing->events()->create(['user_id' => $actor->id, 'action' => 'branch_withdrawn', 'description' => 'سُحب الإغلاق قبل فتحه للتدقيق.']);
    }

    public function earlyClose(Closing $closing): void
    {
        $this->require(! $closing->submitted_snapshot && $closing->coverage_until->greaterThan(now()) && $closing->coverage_from->lessThan(now()), 'الإغلاق المبكر متاح للفترة المفتوحة فقط.');
        $at = now()->toImmutable()->utc();
        $this->closePeriodBoxes($closing, $at, 'early');
        Closing::query()->where('branch_id', $closing->branch_id)->where('coverage_from', $closing->coverage_from)->update(['coverage_until' => $at, 'is_manual' => true]);
        $remainder = $this->createPeriod($closing->branch_id, $at, $closing->scheduled_until, $closing->workflow_settings);
        CashBox::query()->where('branch_id', $closing->branch_id)->where('kind', 'direct')->where('status', 'open')->update(['closing_id' => $remainder->id]);
        Closing::query()->where('branch_id', $closing->branch_id)->where('coverage_from', $remainder->coverage_from)->update(['workflow_settings' => [...$closing->workflow_settings, 'continuation' => true]]);
    }

    /** @param array<string, mixed> $data */
    public function changeSettings(int $branchId, User $actor, array $data): void
    {
        $closing = $this->current($branchId);
        ClosingSettingChange::query()->create(['branch_id' => $branchId, 'settings' => $data['settings'], 'effective_from' => $closing->scheduled_until, 'user_id' => $actor->id]);
        ClosingSetting::ownFor($branchId)->update(['receivers' => array_map('intval', $data['receivers'] ?? []), 'approvers' => array_map('intval', $data['approvers'] ?? []), 'updated_by' => $actor->id]);
    }

    /** @param array<string, mixed> $data */
    public function reply(AuditNote $note, User $actor, array $data, ?string $document): void
    {
        $this->require(in_array($note->status, ['awaiting_reply', 'rejected', 'collector_replied'], true), 'الملاحظة لا تنتظر ردّ الفرع.');
        $this->require($note->status !== 'rejected' || $data['kind'] === 'adjustment', 'الاعتراض المرفوض يحتاج قيد تصحيح في الأسبوع المفتوح.');
        if ($data['kind'] !== 'collector' && $note->differences && ! $note->difference_decisions) {
            $decisions = [];
            foreach ($note->differences as $currency => $amount) {
                if (! in_array($currency, self::CURRENCIES, true) || Closing::cents($amount) === 0) {
                    continue;
                }
                $decision = $data['decisions'][$currency] ?? null;
                $this->require(in_array($decision, ['accepted', 'debt'], true), 'حدّد قرار فرق التدقيق لكل عملة.');
                if (Closing::cents($amount) < 0 && $decision === 'debt') {
                    $this->require($note->box?->user_id !== null, 'الدين يحتاج صندوق محصّل.');
                    $debt = CollectorDebt::query()->firstOrNew(['cash_box_id' => $note->cash_box_id, 'currency' => $currency], ['branch_id' => $note->closing->branch_id, 'user_id' => $note->box->user_id, 'amount' => '0.00', 'remaining' => '0.00']);
                    $debt->fill(['amount' => Closing::money(Closing::cents($debt->amount) - Closing::cents($amount)), 'remaining' => Closing::money(Closing::cents($debt->remaining) - Closing::cents($amount))])->save();
                }
                $decisions[$currency] = Closing::cents($amount) > 0 ? 'accepted' : $decision;
            }
            $note->update(['difference_decisions' => $decisions]);
        }
        if ($data['kind'] === 'adjustment') {
            $closing = $this->current($note->closing->branch_id, $data['book']);
            ClosingAdjustment::query()->create(['closing_id' => $closing->id, 'original_closing_id' => $note->closing_id, 'audit_note_id' => $note->id, 'user_id' => $actor->id, 'book' => $data['book'], 'currency' => $data['currency'], 'amount' => $data['amount'], 'reason' => $data['body']]);
        }
        if ($data['kind'] === 'collector') {
            $this->require($note->box?->user_id !== null, 'الملاحظة غير مرتبطة بصندوق محصّل.');
            $note->update(['assigned_to' => $note->box->user_id, 'status' => 'with_collector']);
            $note->box->user->notify(new BranchClosingNotification('ملاحظة تدقيق تنتظر ردّك', (string) $note->id));
        } else {
            $note->update(['status' => 'awaiting_audit']);
        }
        $note->replies()->create(['user_id' => $actor->id, 'kind' => $data['kind'], 'body' => $data['body'], 'document_path' => $document]);
    }

    /** @param array<string, mixed> $counts @param array<string, mixed> $expected @return array<string, string> */
    public function differences(array $counts, array $expected): array
    {
        return collect(self::CURRENCIES)->mapWithKeys(fn (string $currency): array => [$currency => Closing::money(Closing::cents($counts[$currency] ?? 0) - Closing::cents($expected[$currency] ?? 0))])->all();
    }

    /** @param array<string, string> $differences */
    private function hasDifference(array $differences): bool
    {
        return collect($differences)->contains(fn (string $amount): bool => Closing::cents($amount) !== 0);
    }

    private function editableEnded(Closing $closing): void
    {
        $this->require(! $closing->submitted_snapshot && $closing->status === ClosingStatus::Draft && $closing->coverage_until->lessThanOrEqualTo(now()), 'الإغلاق مقفل أو لم يصل وقت القطع بعد.');
    }

    public function require(bool $condition, string $message): void
    {
        if (! $condition) {
            throw ValidationException::withMessages(['action' => $message]);
        }
    }
}
