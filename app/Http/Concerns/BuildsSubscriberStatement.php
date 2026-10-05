<?php

namespace App\Http\Concerns;

use App\Enums\ChargeType;
use App\Enums\CorrectionReason;
use App\Enums\Currency;
use App\Enums\DiscountMethod;
use App\Enums\PaymentMethod;
use App\Enums\PermissionKey;
use App\Models\MeterReading;
use App\Models\StandingDiscount;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * A subscriber's account statement — every charge, payment and discount,
 * oldest first, each with the balance it left — with what the payment,
 * charge and discount forms need. A corrected or deleted line is followed
 * by its reversal and the line that replaced it. Shared by the statement
 * page and the statement window on the subscribers list. Transactions stay
 * in their original chronological order, including reversals and corrections.
 */
trait BuildsSubscriberStatement
{
    /**
     * The statement shown in a window over a list, for the subscriber named
     * by `?statement=` — kept in the address so the window stays open after
     * a payment, charge or discount is saved in it. Null when none is asked
     * for, or the subscriber isn't one the actor may see.
     *
     * @return array<string, mixed>|null
     */
    protected function requestedStatement(Request $request, User $actor): ?array
    {
        $subscriberId = $request->query('statement');

        if (! is_string($subscriberId) || ! ctype_digit($subscriberId)) {
            return null;
        }

        $subscriber = Subscriber::query()->visibleTo($actor)->find($subscriberId);

        return $subscriber && $actor->can('view', $subscriber) ? $this->subscriberStatement($actor, $subscriber) : null;
    }

    /**
     * @return array<string, mixed>
     */
    protected function subscriberStatement(User $actor, Subscriber $subscriber): array
    {
        $subscriber->loadMissing(['profile', 'branch', 'tariff', 'tariffSegment', 'meterBox', 'circuitBreaker', 'standingDiscount.grantedBy', 'latestMeterReading']);

        $transactions = $subscriber->transactions()
            ->with([
                'recordedBy',
                'meterReading',
                'cancelledBy',
                'reverses.closingLine.closing',
                'referenceTransaction.closingLine.closing',
                'linkedReversals',
                'corrects',
                'correction',
                'amendments.user',
                'closingLine.closing',
            ])
            ->oldest()
            ->orderBy('id')
            ->get()
            ->each(fn (SubscriberTransaction $transaction) => $transaction->setRelation('subscriber', $subscriber));

        $firstLineIds = $this->firstLineIds($transactions);
        $lineNumbers = $transactions->values()->mapWithKeys(fn (SubscriberTransaction $transaction, int $index): array => [$transaction->id => $index + 1])->all();
        $balanceInCents = 0;
        $lastTransactionId = $transactions->last()?->id;
        $previousTransactionId = $transactions->count() > 1 ? $transactions->values()->get($transactions->count() - 2)->id : null;
        $lastGroupId = $transactions->whereNull('reverses_id')->last()?->id;
        $lastLegacyLineId = $transactions
            ->filter(fn (SubscriberTransaction $transaction): bool => $transaction->id === $lastGroupId || $transaction->reverses_id === $lastGroupId)
            ->last()?->id;
        $entries = $transactions
            ->map(function (SubscriberTransaction $transaction) use (&$balanceInCents, $actor, $firstLineIds, $lineNumbers, $lastTransactionId, $previousTransactionId, $lastLegacyLineId, $transactions): array {
                $balanceInCents += $this->cents($transaction->amount);
                $hasPayment = $transactions->contains(fn (SubscriberTransaction $candidate): bool => $candidate->reference_transaction_id === $transaction->id
                    && in_array($candidate->type, SubscriberTransaction::PAYMENT_LIKE_TYPES, true));
                // A standing weekly reading's own standing discount, which cancelling the reading cancels too.
                $readingDiscount = $transaction->type === SubscriberTransaction::TYPE_METER_READING && $transaction->meter_reading_id !== null && ! $transaction->isCancelled()
                    ? $transactions->first(fn (SubscriberTransaction $candidate): bool => $candidate->meter_reading_id === $transaction->meter_reading_id
                        && $candidate->type === SubscriberTransaction::TYPE_READING_DISCOUNT
                        && ! $candidate->isCancelled())
                    : null;

                // A reading followed only by its own standing discount is the last bill: the two are deleted together.
                $isLast = $transaction->id === $lastTransactionId
                    || ($transaction->id === $previousTransactionId && $readingDiscount?->id === $lastTransactionId);
                $entry = $this->statementEntry(
                    $transaction,
                    $balanceInCents,
                    $actor,
                    $firstLineIds[$transaction->id],
                    $lineNumbers,
                    $isLast,
                    $hasPayment,
                    $transaction->id === $lastLegacyLineId,
                );

                if ($readingDiscount !== null) {
                    $entry['actionEffects']['delete'] = $this->money($this->cents($transaction->amount) + $this->cents($readingDiscount->amount));
                }

                return [...$entry, 'readingDiscount' => $readingDiscount ? SubscriberTransaction::formatAmount(abs((float) $readingDiscount->amount)) : null];
            })
            ->values();

        // Cancelled lines and their reversals cancel each other out, so the totals leave both out.
        $counted = $transactions->reject(fn (SubscriberTransaction $transaction): bool => $transaction->isCancelled() || $transaction->isReversal());
        $payments = $counted->filter(fn (SubscriberTransaction $transaction): bool => $transaction->isPayment());
        $discounts = $counted->filter(fn (SubscriberTransaction $transaction): bool => $transaction->isDiscount());
        $clearings = $counted->filter(fn (SubscriberTransaction $transaction): bool => $transaction->isClearing());
        $sumOf = fn ($lines): int => $lines->sum(fn (SubscriberTransaction $transaction): int => $this->cents($transaction->amount));
        $latestWeekReading = $subscriber->latestWeekReading();
        $canAdjustBalance = $actor->can('adjustBalance', $subscriber);

        return [
            'subscriber' => [
                'id' => $subscriber->id,
                'fullName' => $subscriber->displayName(),
                'accountNumber' => $subscriber->account_number,
                'subscriberNumber' => $subscriber->profile?->subscriber_number,
                'phone' => $subscriber->contactPhone(),
                'branchName' => $subscriber->branch->name,
                'tariffCategoryLabel' => __($subscriber->tariff->category->label()),
                'tariffSegmentName' => $subscriber->tariffSegment?->name,
                'meterBoxNumber' => $subscriber->meterBox?->box_number,
                'kiloPrice' => $subscriber->tariff->rate,
                'minimumPayment' => $subscriber->weeklyMinimumPayment(),
                'subscriptionFee' => $subscriber->subscription_fee,
                // The discount form's worked example uses the last week read.
                'lastConsumption' => $subscriber->latestMeterReading?->consumption,
                // Giving or stopping a standing discount rebills this reading at once.
                'latestWeekReading' => $latestWeekReading ? [
                    'consumption' => $latestWeekReading->consumption,
                    'unitPrice' => $latestWeekReading->unit_price,
                    'minimumPayment' => $latestWeekReading->minimum_payment,
                    'isApproved' => ! $latestWeekReading->isPending(),
                ] : null,
                'standingDiscount' => $this->statementStandingDiscount($subscriber->standingDiscount),
                'status' => $subscriber->status->value,
                'statusLabel' => __($subscriber->status->label()),
            ],
            'subscriptions' => $this->profileSubscriptions($actor, $subscriber),
            'entries' => $entries,
            'summary' => [
                'balance' => $this->money($balanceInCents),
                'charged' => $this->money($sumOf($counted->reject->isCredit())),
                'paid' => $this->money(-$sumOf($payments)),
                'paymentsCount' => $payments->count(),
                'discounted' => $this->money(-$sumOf($discounts)),
                'discountsCount' => $discounts->count(),
                'cleared' => $this->money(-$sumOf($clearings)),
                'clearingsCount' => $clearings->count(),
            ],
            'canRecordPayment' => $actor->can('recordPayment', $subscriber),
            'canAdjustBalance' => $canAdjustBalance,
            'currencies' => Currency::options(),
            'paymentMethods' => PaymentMethod::options(PaymentMethod::offered()),
            'transferBanks' => config('powercollect.transfer_banks'),
            'chargeTypes' => ChargeType::formOptions(),
            'discountMethods' => DiscountMethod::options(),
            // Offered while typing a standing discount's customer segment.
            'discountSegments' => $canAdjustBalance ? StandingDiscount::segmentSuggestions() : [],
            'transactionTypes' => collect(SubscriberTransaction::typeLabels())
                ->map(fn (string $label, string $type): array => ['value' => $type, 'label' => $label])
                ->values(),
            'correctionReasons' => [
                'payment' => CorrectionReason::options(CorrectionReason::forPaymentCorrection()),
                'adjustment' => CorrectionReason::options(CorrectionReason::forAdjustmentCorrection()),
            ],
        ];
    }

    /**
     * Every subscription of the same person that the actor may see, the
     * open one among them, each with its balance and what the statement
     * window's header shows, so the statement can switch between them.
     *
     * @return array<int, array<string, mixed>>
     */
    private function profileSubscriptions(User $actor, Subscriber $subscriber): array
    {
        if ($subscriber->subscriber_profile_id === null) {
            return [];
        }

        return Subscriber::query()
            ->visibleTo($actor)
            ->where('subscriber_profile_id', $subscriber->subscriber_profile_id)
            ->with(['branch', 'tariff', 'tariffSegment', 'meterBox'])
            ->withSum('transactions as balance', 'amount')
            ->orderBy('account_number')
            ->get()
            ->map(fn (Subscriber $subscription): array => [
                'id' => $subscription->id,
                'fullName' => $subscription->displayName(),
                'accountNumber' => $subscription->account_number,
                'branchName' => $subscription->branch->name,
                'tariffCategoryLabel' => __($subscription->tariff->category->label()),
                'tariffSegmentName' => $subscription->tariffSegment?->name,
                'meterBoxNumber' => $subscription->meterBox?->box_number,
                'status' => $subscription->status->value,
                'statusLabel' => __($subscription->status->label()),
                'balance' => $this->money($this->cents((string) ($subscription->balance ?? '0'))),
            ])
            ->all();
    }

    /**
     * Each line's foldable group: the line itself, or for a reversal the
     * line it cancels. This relation does not change chronological display
     * order; it only lets the user manually fold an audit pair.
     *
     * @param  Collection<int, SubscriberTransaction>  $transactions  oldest first
     * @return array<int, int>
     */
    private function firstLineIds(Collection $transactions): array
    {
        $byId = $transactions->keyBy('id');

        return $transactions
            ->mapWithKeys(fn (SubscriberTransaction $line): array => [
                $line->id => $line->reverses_id && $byId->has($line->reverses_id) ? (int) $line->reverses_id : $line->id,
            ])
            ->all();
    }

    /**
     * The subscriber's standing discount as the statement shows it, or null
     * when they have none.
     *
     * @return array{method: string, value: string, terms: string, segment: ?string, notes: ?string, grantedByName: ?string, grantedAt: string}|null
     */
    private function statementStandingDiscount(?StandingDiscount $discount): ?array
    {
        if ($discount === null) {
            return null;
        }

        return [
            'method' => $discount->method->value,
            'value' => $discount->value,
            'terms' => $discount->terms(),
            'segment' => $discount->segment,
            'notes' => $discount->notes,
            'grantedByName' => $discount->grantedBy?->name,
            'grantedAt' => $this->businessTime($discount->updated_at, 'Y-m-d'),
        ];
    }

    /**
     * One statement line. `balance` is what the subscriber owes after it
     * (negative when they are in credit); `amount` is what was charged,
     * handed over or discounted, in the line's own currency. `details` is
     * what the user wrote about it (a reading's notes for a weekly reading).
     * `groupId` is the first line of the chain of corrections it belongs to.
     * A reversal shows the voucher, cash box, bank and reference of the line
     * it cancels, which it has none of its own.
     *
     * @return array<string, mixed>
     */
    private function statementEntry(
        SubscriberTransaction $transaction,
        int $balanceInCents,
        User $actor,
        int $groupId,
        array $lineNumbers,
        bool $isLastTransaction,
        bool $hasPayment,
        bool $isLastLegacyLine,
    ): array {
        $receipt = $transaction->isReversal() && $transaction->reverses ? $transaction->reverses : $transaction;
        $hasEditPermission = $actor->hasPermission(PermissionKey::CorrectTransactions);
        $hasAmendPermission = $actor->hasPermission(PermissionKey::AmendTransactionDetails);
        $hasDeletePermission = $actor->hasPermission($transaction->isPayment() ? PermissionKey::RefundPayments : PermissionKey::DeleteTransactions);
        $hasForceDeletePermission = $actor->hasPermission(PermissionKey::ForceDeleteTransactions);
        $canAmend = $actor->can('amend', $transaction);
        $canCorrect = $actor->can('update', $transaction);
        $canDelete = $actor->can('delete', $transaction);
        $canForceDelete = $isLastLegacyLine && $actor->can('forceDelete', $transaction);
        $mayCancel = $hasDeletePermission;
        $eraseTarget = $transaction->isReversal() ? $transaction->reverses : $transaction;
        $availableActions = $transaction->availableActions($actor, $isLastTransaction, $hasPayment);
        $linkedReversals = $transaction->linkedReversals
            ->whereIn('type', SubscriberTransaction::REVERSAL_TYPES)
            ->values();
        $linkedReversal = $linkedReversals->last();
        $treeEffectInCents = $this->cents($transaction->amount)
            + $linkedReversals->sum(fn (SubscriberTransaction $reversal): int => $this->cents($reversal->amount));
        $refundedInCents = $linkedReversals
            ->where('type', SubscriberTransaction::TYPE_REFUND)
            ->sum(fn (SubscriberTransaction $refund): int => abs($this->cents($refund->amount)));

        return [
            'id' => $transaction->id,
            // In this application a subscribers row is the individual subscription.
            'subscription_id' => $transaction->subscriber_id,
            'branch_id' => $transaction->branch_id,
            'employee_id' => $transaction->employee_id,
            'lineNumber' => $lineNumbers[$transaction->id],
            'groupId' => $groupId,
            'date' => $this->businessTime($transaction->created_at),
            'voucherNumber' => $receipt->displayVoucherNumber(),
            'systemVoucherNumber' => $receipt->printedVoucherNumber(),
            'manualVoucherNumber' => $receipt->manual_voucher_number,
            'description' => $transaction->description(),
            'type' => $transaction->type,
            'typeLabel' => $transaction->typeLabel(),
            'status' => $transaction->status,
            'reference_transaction_id' => $transaction->reference_transaction_id,
            'balance_after' => $transaction->balance_after ?? $this->money($balanceInCents),
            'available_actions' => $availableActions,
            'actionEffects' => [
                'delete' => $transaction->amount,
                'delete_reversal' => $transaction->amount,
                'delete_tree' => $this->money($treeEffectInCents),
            ],
            'refundableAmount' => $transaction->isPayment()
                ? $this->money(max(0, abs($this->cents($transaction->amount)) - $refundedInCents))
                : null,
            'isCredit' => $transaction->isCredit(),
            'amount' => $transaction->currency_amount ?? ltrim($transaction->amount, '-'),
            'currencyLabel' => __($transaction->currency->label()),
            'exchangeRate' => rtrim(rtrim($transaction->exchange_rate, '0'), '.'),
            'balance' => $this->money($balanceInCents),
            'paymentMethod' => $transaction->payment_method?->value,
            'paymentMethodLabel' => $transaction->payment_method ? __($transaction->payment_method->label()) : null,
            'bankName' => $receipt->bank_name,
            'senderBankName' => $receipt->sender_bank_name,
            'senderName' => $receipt->sender_name,
            'referenceNumber' => $receipt->reference_number,
            'cashBox' => $receipt->cash_box,
            'recordedByName' => $transaction->recordedBy?->name,
            // The weekly reading the line was billed from, which a reading and its standing discount share.
            'meterReadingId' => $transaction->meter_reading_id,
            // The weekly reading a standing line was billed from, to correct from the line's menu;
            // a reading's discount has no menu of its own, as it goes with its reading.
            'reading' => $transaction->type === SubscriberTransaction::TYPE_READING_DISCOUNT ? null : $this->correctableReading($transaction, $actor),
            // A payment's receipt, to print or reprint from the line's menu.
            'receiptUrl' => $transaction->isPayment() ? route('subscribers.payments.receipt', [$transaction->subscriber_id, $transaction->id]) : null,
            'details' => match ($transaction->type) {
                SubscriberTransaction::TYPE_METER_READING => $transaction->notes ?? $transaction->meterReading?->notes,
                // Its customer segment is already in the description.
                SubscriberTransaction::TYPE_READING_DISCOUNT => null,
                default => $transaction->notes,
            },
            // A reversal, shown indented under the line it cancels.
            'isFollowUp' => $transaction->reverses_id !== null,
            'isReversal' => $transaction->isReversal(),
            'isCorrection' => $transaction->corrects_id !== null,
            'reverses' => $transaction->reverses ? [
                'id' => $transaction->reverses->id,
                'lineNumber' => $lineNumbers[$transaction->reverses->id] ?? null,
            ] : null,
            'linkedReversal' => $linkedReversal ? [
                'id' => $linkedReversal->id,
                'lineNumber' => $lineNumbers[$linkedReversal->id] ?? null,
                'type' => $linkedReversal->type,
            ] : null,
            'linkedReversals' => $linkedReversals->map(fn (SubscriberTransaction $reversal): array => [
                'id' => $reversal->id,
                'lineNumber' => $lineNumbers[$reversal->id] ?? null,
                'type' => $reversal->type,
                'typeLabel' => $reversal->typeLabel(),
                'description' => $reversal->description(),
                'amount' => SubscriberTransaction::formatAmount(abs((float) $reversal->amount)),
            ])->all(),
            // The line a replacement corrects, which stays further up the statement.
            'corrects' => $transaction->corrects ? [
                'id' => $transaction->corrects->id,
                'lineNumber' => $lineNumbers[$transaction->corrects->id] ?? null,
                'date' => $this->businessTime($transaction->corrects->created_at),
            ] : null,
            'cancellation' => $transaction->isCancelled() ? [
                'wasCorrected' => $transaction->correction !== null,
                'correctionId' => $transaction->correction?->id,
                'correctionLineNumber' => $transaction->correction ? ($lineNumbers[$transaction->correction->id] ?? null) : null,
                'reasonLabel' => $transaction->cancellation_reason ? __($transaction->cancellation_reason->label()) : 'تصحيح الحركة',
                'notes' => $transaction->cancellation_notes,
                'byName' => $transaction->cancelledBy?->name,
                'at' => $this->businessTime($transaction->cancelled_at),
            ] : null,
            'isAmended' => $transaction->amendments->isNotEmpty(),
            'amendments' => $transaction->amendments->map(fn ($amendment): array => [
                'id' => $amendment->id,
                'userName' => $amendment->user?->name,
                'at' => $this->businessTime($amendment->created_at),
                'reason' => $amendment->reason,
                'changes' => collect($amendment->changes)->map(fn (array $values, string $field): array => [
                    'field' => $field,
                    'label' => $this->amendmentFieldLabel($field),
                    'from' => $values[0] ?? null,
                    'to' => $values[1] ?? null,
                ])->values()->all(),
            ])->values()->all(),
            'canAmend' => $canAmend,
            'canCorrect' => $canCorrect,
            'canDelete' => $canDelete,
            'canForceDelete' => $canForceDelete,
            'amendUnavailableReason' => $hasAmendPermission && ! $canAmend ? ($transaction->amendmentUnavailableReason() ?? 'غير متاح الآن') : null,
            'correctUnavailableReason' => $hasEditPermission && ! $canCorrect
                ? ($transaction->isCancelled() || $transaction->isReversal() ? 'الحركة ملغاة' : 'لا ينطبق على هذه الحركة')
                : null,
            'deleteUnavailableReason' => $mayCancel && ! $canDelete
                ? ($transaction->isCancelled() || $transaction->isReversal() ? 'الحركة ملغاة' : 'لا يمكن إلغاؤها الآن')
                : null,
            'forceDeleteUnavailableReason' => $hasForceDeletePermission && ! $canForceDelete
                ? match (true) {
                    ! $isLastLegacyLine => 'ليست آخر حركة',
                    $eraseTarget?->closingLine !== null => 'ضمن إغلاق مالي',
                    default => 'لا يمكن حذفها نهائيًا',
                }
                : null,
            // What erasing it takes off the balance: nothing for a reversal or a cancelled line, which go together.
            'eraseEffect' => $transaction->isCancelled() || $transaction->isReversal() ? '0.00' : $transaction->amount,
            'deletionReasons' => $transaction->isCancellable() ? CorrectionReason::options(CorrectionReason::forDeletionOf($transaction)) : [],
            // What the correction form starts from: the line as it was recorded.
            'recorded' => $transaction->isCorrectable()
                ? $this->recordedFields($transaction)
                : ($transaction->isCancellable() ? ['kind' => $transaction->type, 'effect' => $transaction->amount] : null),
        ];
    }

    /**
     * The weekly reading a standing reading or standing-discount line was
     * billed from, as the reading form edits it, for users who record
     * readings. Correcting it is how such a line's amount changes: the line
     * is cancelled with a reversal, and the reading goes back for approval
     * and is billed again (MeterReading::correct). Only the subscriber's
     * latest reading, in a week still open to the user, can be corrected.
     *
     * @return array{id: int, weekStart: string, weekEnd: string, previous_reading: float, current_reading: float, consumption: float, notes: ?string, status: string, subscriberName: string, accountNumber: ?string, canCorrect: bool, canApprove: bool, correctUnavailableReason: ?string}|null
     */
    private function correctableReading(SubscriberTransaction $transaction, User $actor): ?array
    {
        $reading = $transaction->meterReading;

        if ($reading === null || $transaction->isCancelled() || ! $actor->hasPermission(PermissionKey::RecordMeterReadings)) {
            return null;
        }

        $isLatest = $transaction->subscriber->latestMeterReading?->is($reading) ?? false;
        $canCorrect = $isLatest && $actor->can('update', $reading);

        return [
            'id' => $reading->id,
            'weekStart' => $reading->week_start->toDateString(),
            'weekEnd' => $reading->week_end->toDateString(),
            'previous_reading' => $reading->previous_reading,
            'current_reading' => $reading->current_reading,
            'consumption' => $reading->consumption,
            'notes' => $reading->notes,
            'status' => $reading->status->value,
            'subscriberName' => $transaction->subscriber->displayName(),
            'accountNumber' => $transaction->subscriber->account_number,
            'canCorrect' => $canCorrect,
            // May approve the corrected reading at once, instead of sending it back for approval.
            'canApprove' => $actor->can('approveAny', MeterReading::class) && ($actor->isSuperAdmin() || $reading->branch_id === $actor->branch_id),
            'correctUnavailableReason' => match (true) {
                $canCorrect => null,
                ! $isLatest => 'توجد قراءة لأسبوع لاحق',
                default => 'انتهت فترة تعديل قراءة هذا الأسبوع',
            },
        ];
    }

    private function amendmentFieldLabel(string $field): string
    {
        return match ($field) {
            'amount' => 'المبلغ',
            'bank_name' => 'البنك المحوّل له',
            'sender_bank_name' => 'البنك المحوّل منه',
            'sender_name' => 'اسم المرسل',
            'reference_number' => 'الرقم المرجعي',
            'notes' => 'الملاحظات',
            default => $field,
        };
    }

    /**
     * A line's own fields, as its payment, charge, discount or clearing
     * form names them, with `effect` — what it did to the balance, in
     * shekels.
     *
     * @return array<string, mixed>
     */
    private function recordedFields(SubscriberTransaction $transaction): array
    {
        $fields = match (true) {
            $transaction->isPayment() => [
                'kind' => 'payment',
                'amount' => SubscriberTransaction::formatAmount($transaction->currency_amount),
                'currency' => $transaction->currency->value,
                'exchange_rate' => $transaction->currency === Currency::Shekel ? '' : rtrim(rtrim($transaction->exchange_rate, '0'), '.'),
                'payment_method' => $transaction->payment_method?->value,
                'bank_name' => $transaction->bank_name ?? '',
                'sender_bank_name' => $transaction->sender_bank_name ?? '',
                'sender_name' => $transaction->sender_name ?? '',
                'reference_number' => $transaction->reference_number ?? '',
                'cash_box' => $transaction->cash_box ?? '',
                'manual_voucher_number' => $transaction->manual_voucher_number ?? '',
            ],
            $transaction->isDiscount() => [
                'kind' => 'discount',
                'method' => $transaction->discount_method?->value,
                'value' => $transaction->discount_value,
            ],
            $transaction->isClearing() => [
                'kind' => 'clearing',
                'amount' => SubscriberTransaction::formatAmount(ltrim($transaction->amount, '-')),
            ],
            default => [
                'kind' => 'charge',
                'type' => $transaction->type,
                'amount' => SubscriberTransaction::formatAmount(ltrim($transaction->amount, '-')),
            ],
        };

        return [...$fields, 'notes' => $transaction->notes ?? '', 'effect' => $transaction->amount];
    }

    /**
     * A stored (UTC) moment as the business's clock shows it, as receipts,
     * the financial log and the audit log show it too.
     */
    private function businessTime(CarbonInterface $moment, string $format = 'Y-m-d H:i'): string
    {
        return $moment->copy()->setTimezone(config('app.business_timezone'))->format($format);
    }

    private function cents(string $amount): int
    {
        return (int) round((float) $amount * 100);
    }

    private function money(int $cents): string
    {
        return number_format($cents / 100, 2, '.', '');
    }
}
