<?php

namespace App\Http\Controllers;

use App\Enums\ChargeType;
use App\Enums\Currency;
use App\Enums\DiscountMethod;
use App\Enums\PaymentMethod;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class SubscriberStatementController extends Controller
{
    /**
     * The subscriber's account statement: every charge, payment and
     * discount, oldest first, each with the balance it left.
     */
    public function show(Request $request, Subscriber $subscriber): InertiaResponse
    {
        $this->authorize('view', $subscriber);

        $subscriber->load(['branch', 'tariff', 'tariffSegment', 'meterBox']);

        $transactions = $subscriber->transactions()
            ->with(['recordedBy', 'meterReading'])
            ->oldest()
            ->orderBy('id')
            ->get();

        $balanceInCents = 0;
        $entries = $transactions->map(function (SubscriberTransaction $transaction) use (&$balanceInCents): array {
            $balanceInCents += $this->cents($transaction->amount);

            return $this->entry($transaction, $balanceInCents);
        });

        $payments = $transactions->filter(fn (SubscriberTransaction $transaction): bool => $transaction->isPayment());
        $discounts = $transactions->filter(fn (SubscriberTransaction $transaction): bool => $transaction->type === SubscriberTransaction::TYPE_DISCOUNT);
        $sumOf = fn ($lines): int => $lines->sum(fn (SubscriberTransaction $transaction): int => $this->cents($transaction->amount));

        return Inertia::render('Subscribers/Statement', [
            'subscriber' => [
                'id' => $subscriber->id,
                'fullName' => $subscriber->full_name,
                'accountNumber' => $subscriber->account_number,
                'branchName' => $subscriber->branch->name,
                'tariffCategoryLabel' => __($subscriber->tariff->category->label()),
                'tariffSegmentName' => $subscriber->tariffSegment?->name,
                'meterBoxNumber' => $subscriber->meterBox?->box_number,
                'kiloPrice' => $subscriber->tariff->rate,
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
            'canRecordPayment' => $request->user()->can('recordPayment', $subscriber),
            'canAdjustBalance' => $request->user()->can('adjustBalance', $subscriber),
            'currencies' => Currency::options(),
            'paymentMethods' => PaymentMethod::options(),
            'chargeTypes' => ChargeType::options(),
            'discountMethods' => DiscountMethod::options(),
            'transactionTypes' => collect(SubscriberTransaction::typeLabels())
                ->map(fn (string $label, string $type): array => ['value' => $type, 'label' => $label])
                ->values(),
        ]);
    }

    /**
     * One statement line. `balance` is what the subscriber owes after it
     * (negative when they are in credit); `amount` is what was charged,
     * handed over or discounted, in the line's own currency. `details` is
     * what the user wrote about it (a reading's notes for a weekly reading).
     *
     * @return array<string, mixed>
     */
    private function entry(SubscriberTransaction $transaction, int $balanceInCents): array
    {
        return [
            'id' => $transaction->id,
            'date' => $transaction->created_at->format('Y-m-d H:i'),
            'voucherNumber' => $transaction->voucher_number ? str_pad((string) $transaction->voucher_number, 6, '0', STR_PAD_LEFT) : null,
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
            'details' => $transaction->notes ?? $transaction->meterReading?->notes,
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
