<?php

namespace App\Http\Concerns;

use App\Enums\ChargeType;
use App\Enums\Currency;
use App\Enums\DiscountMethod;
use App\Enums\PaymentMethod;
use App\Models\StandingDiscount;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * A subscriber's account statement — every charge, payment and discount,
 * oldest first, each with the balance it left — with what the payment,
 * charge and discount forms need. Shared by the statement page and the
 * statement window on the subscribers list.
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
            ->with(['recordedBy', 'meterReading'])
            ->oldest()
            ->orderBy('id')
            ->get();

        $balanceInCents = 0;
        $entries = $transactions->map(function (SubscriberTransaction $transaction) use (&$balanceInCents): array {
            $balanceInCents += $this->cents($transaction->amount);

            return $this->statementEntry($transaction, $balanceInCents);
        });

        $payments = $transactions->filter(fn (SubscriberTransaction $transaction): bool => $transaction->isPayment());
        $discounts = $transactions->filter(fn (SubscriberTransaction $transaction): bool => $transaction->isDiscount());
        $sumOf = fn ($lines): int => $lines->sum(fn (SubscriberTransaction $transaction): int => $this->cents($transaction->amount));

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
                'standingDiscount' => $this->statementStandingDiscount($subscriber->standingDiscount),
                'status' => $subscriber->status->value,
                'statusLabel' => __($subscriber->status->label()),
            ],
            'entries' => $entries,
            'summary' => [
                'balance' => $this->money($balanceInCents),
                'charged' => $this->money($sumOf($transactions->reject->isCredit())),
                'paid' => $this->money(-$sumOf($payments)),
                'paymentsCount' => $payments->count(),
                'discounted' => $this->money(-$sumOf($discounts)),
                'discountsCount' => $discounts->count(),
            ],
            'canRecordPayment' => $actor->can('recordPayment', $subscriber),
            'canAdjustBalance' => $actor->can('adjustBalance', $subscriber),
            'currencies' => Currency::options(),
            'paymentMethods' => PaymentMethod::options(PaymentMethod::offered()),
            'transferBanks' => config('powercollect.transfer_banks'),
            'chargeTypes' => ChargeType::options(),
            'discountMethods' => DiscountMethod::options(),
            'transactionTypes' => collect(SubscriberTransaction::typeLabels())
                ->map(fn (string $label, string $type): array => ['value' => $type, 'label' => $label])
                ->values(),
        ];
    }

    /**
     * The subscriber's standing discount as the statement shows it, or null
     * when they have none.
     *
     * @return array{method: string, value: string, terms: string, notes: ?string, grantedByName: ?string, grantedAt: string}|null
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
    private function statementEntry(SubscriberTransaction $transaction, int $balanceInCents): array
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
            'details' => $transaction->notes ?? ($transaction->type === SubscriberTransaction::TYPE_METER_READING ? $transaction->meterReading?->notes : null),
        ];
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
