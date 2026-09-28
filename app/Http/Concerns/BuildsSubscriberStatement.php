<?php

namespace App\Http\Concerns;

use App\Enums\ChargeType;
use App\Enums\CorrectionReason;
use App\Enums\Currency;
use App\Enums\DiscountMethod;
use App\Enums\PaymentMethod;
use App\Models\StandingDiscount;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * A subscriber's account statement — every charge, payment and discount,
 * oldest first, each with the balance it left — with what the payment,
 * charge and discount forms need. A corrected or deleted line is followed
 * by its reversal and the line that replaced it. Shared by the statement
 * page and the statement window on the subscribers list.
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
        $subscriber->loadMissing(['branch', 'tariff', 'tariffSegment', 'meterBox', 'circuitBreaker', 'standingDiscount.grantedBy', 'latestMeterReading']);

        $transactions = $subscriber->transactions()
            ->with(['recordedBy', 'meterReading', 'cancelledBy', 'reverses', 'correction'])
            ->oldest()
            ->orderBy('id')
            ->get()
            ->each(fn (SubscriberTransaction $transaction) => $transaction->setRelation('subscriber', $subscriber));

        $balanceInCents = 0;
        $entries = $this->withFollowUpsUnderTheirLine($transactions)->map(function (SubscriberTransaction $transaction) use (&$balanceInCents, $actor): array {
            $balanceInCents += $this->cents($transaction->amount);

            return $this->statementEntry($transaction, $balanceInCents, $actor);
        })->values();

        // Cancelled lines and their reversals cancel each other out, so the totals leave both out.
        $counted = $transactions->reject(fn (SubscriberTransaction $transaction): bool => $transaction->isCancelled() || $transaction->isReversal());
        $payments = $counted->filter(fn (SubscriberTransaction $transaction): bool => $transaction->isPayment());
        $discounts = $counted->filter(fn (SubscriberTransaction $transaction): bool => $transaction->isDiscount());
        $sumOf = fn ($lines): int => $lines->sum(fn (SubscriberTransaction $transaction): int => $this->cents($transaction->amount));
        $latestWeekReading = $subscriber->latestWeekReading();
        $canAdjustBalance = $actor->can('adjustBalance', $subscriber);

        return [
            'subscriber' => [
                'id' => $subscriber->id,
                'fullName' => $subscriber->full_name,
                'accountNumber' => $subscriber->account_number,
                'phone' => $subscriber->phone,
                'branchName' => $subscriber->branch->name,
                'tariffCategoryLabel' => __($subscriber->tariff->category->label()),
                'tariffSegmentName' => $subscriber->tariffSegment?->name,
                'meterBoxNumber' => $subscriber->meterBox?->box_number,
                'kiloPrice' => $subscriber->tariff->rate,
                'minimumPayment' => $subscriber->weeklyMinimumPayment(),
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
            'entries' => $entries,
            'summary' => [
                'balance' => $this->money($balanceInCents),
                'charged' => $this->money($sumOf($counted->reject->isCredit())),
                'paid' => $this->money(-$sumOf($payments)),
                'paymentsCount' => $payments->count(),
                'discounted' => $this->money(-$sumOf($discounts)),
                'discountsCount' => $discounts->count(),
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
                'deletion' => CorrectionReason::options(CorrectionReason::forDeletion()),
            ],
        ];
    }

    /**
     * The lines oldest first, except that the reversal and replacement of
     * a corrected or deleted line come straight after it (and those of its
     * replacement after them), so each correction reads under the line it
     * corrects.
     *
     * @param  Collection<int, SubscriberTransaction>  $transactions  oldest first
     * @return Collection<int, SubscriberTransaction>
     */
    private function withFollowUpsUnderTheirLine(Collection $transactions): Collection
    {
        $byId = $transactions->keyBy('id');
        $firstLineOf = function (SubscriberTransaction $line) use ($byId, &$firstLineOf): int {
            $correctedId = $line->reverses_id ?? $line->corrects_id;

            return $correctedId && $byId->has($correctedId) ? $firstLineOf($byId[$correctedId]) : $line->id;
        };

        return $transactions->groupBy($firstLineOf)->flatten(1);
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
            'grantedAt' => $discount->updated_at->format('Y-m-d'),
        ];
    }

    /**
     * One statement line. `balance` is what the subscriber owes after it
     * (negative when they are in credit); `amount` is what was charged,
     * handed over or discounted, in the line's own currency. `details` is
     * what the user wrote about it (a reading's notes for a weekly reading).
     *
     * @return array<string, mixed>
     */
    private function statementEntry(SubscriberTransaction $transaction, int $balanceInCents, User $actor): array
    {
        return [
            'id' => $transaction->id,
            'date' => $transaction->created_at->format('Y-m-d H:i'),
            'voucherNumber' => $transaction->printedVoucherNumber(),
            'manualVoucherNumber' => $transaction->manual_voucher_number,
            'description' => $transaction->description(),
            'type' => $transaction->type,
            'typeLabel' => $transaction->typeLabel(),
            'isCredit' => $transaction->isCredit(),
            'amount' => $transaction->currency_amount ?? ltrim($transaction->amount, '-'),
            'currencyLabel' => __($transaction->currency->label()),
            'exchangeRate' => rtrim(rtrim($transaction->exchange_rate, '0'), '.'),
            'balance' => $this->money($balanceInCents),
            'paymentMethod' => $transaction->payment_method?->value,
            'paymentMethodLabel' => $transaction->payment_method ? __($transaction->payment_method->label()) : null,
            'bankName' => $transaction->bank_name,
            'referenceNumber' => $transaction->reference_number,
            'cashBox' => $transaction->cash_box,
            'recordedByName' => $transaction->recordedBy?->name,
            'details' => match ($transaction->type) {
                SubscriberTransaction::TYPE_METER_READING => $transaction->notes ?? $transaction->meterReading?->notes,
                // Its customer segment is already in the description.
                SubscriberTransaction::TYPE_READING_DISCOUNT => null,
                default => $transaction->notes,
            },
            // A reversal or a replacement, shown indented under the line it corrects.
            'isFollowUp' => $transaction->reverses_id !== null || $transaction->corrects_id !== null,
            'isReversal' => $transaction->isReversal(),
            'isCorrection' => $transaction->corrects_id !== null,
            'cancellation' => $transaction->isCancelled() ? [
                'wasCorrected' => $transaction->correction !== null,
                'reasonLabel' => __($transaction->cancellation_reason->label()),
                'notes' => $transaction->cancellation_notes,
                'byName' => $transaction->cancelledBy?->name,
                'at' => $transaction->cancelled_at->format('Y-m-d H:i'),
            ] : null,
            'canCorrect' => $actor->can('update', $transaction),
            'canDelete' => $actor->can('delete', $transaction),
            // What the correction form starts from: the line as it was recorded.
            'recorded' => $transaction->isCorrectable() ? $this->recordedFields($transaction) : null,
        ];
    }

    /**
     * A line's own fields, as its payment, charge or discount form names
     * them, with `effect` — what it did to the balance, in shekels.
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
            default => [
                'kind' => 'charge',
                'type' => $transaction->type,
                'amount' => SubscriberTransaction::formatAmount(ltrim($transaction->amount, '-')),
            ],
        };

        return [...$fields, 'notes' => $transaction->notes ?? '', 'effect' => $transaction->amount];
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
