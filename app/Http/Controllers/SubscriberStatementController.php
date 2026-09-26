<?php

namespace App\Http\Controllers;

use App\Enums\Currency;
use App\Enums\PaymentMethod;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class SubscriberStatementController extends Controller
{
    /**
     * The subscriber's account statement: every charge and payment, oldest
     * first, each with the balance it left.
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

        return Inertia::render('Subscribers/Statement', [
            'subscriber' => [
                'id' => $subscriber->id,
                'fullName' => $subscriber->full_name,
                'accountNumber' => $subscriber->account_number,
                'branchName' => $subscriber->branch->name,
                'tariffCategoryLabel' => __($subscriber->tariff->category->label()),
                'tariffSegmentName' => $subscriber->tariffSegment?->name,
                'meterBoxNumber' => $subscriber->meterBox?->box_number,
                'status' => $subscriber->status->value,
                'statusLabel' => __($subscriber->status->label()),
            ],
            'entries' => $entries,
            'summary' => [
                'balance' => $this->money($balanceInCents),
                'charged' => $this->money($transactions->reject->isPayment()->sum(fn (SubscriberTransaction $transaction): int => $this->cents($transaction->amount))),
                'paid' => $this->money(-$payments->sum(fn (SubscriberTransaction $transaction): int => $this->cents($transaction->amount))),
                'paymentsCount' => $payments->count(),
            ],
            'canRecordPayment' => $request->user()->can('recordPayment', $subscriber),
            'currencies' => Currency::options(),
            'paymentMethods' => PaymentMethod::options(),
        ]);
    }

    /**
     * One statement line. `balance` is what the subscriber owes after it
     * (negative when they are in credit); `amount` is what was charged or
     * handed over, in the line's own currency.
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
            'isPayment' => $transaction->isPayment(),
            'kindLabel' => $transaction->kindLabel(),
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
            'notes' => $transaction->notes ?? $transaction->meterReading?->notes,
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
