<?php

namespace App\Http\Controllers;

use App\Enums\Currency;
use App\Enums\PaymentMethod;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

class SubscriberStatementController extends Controller
{
    /**
     * The spreadsheet's header row, in the order of the statement table.
     */
    private const EXPORT_COLUMNS = [
        'تاريخ الحركة',
        'رقم السند',
        'السند اليدوي',
        'البيان',
        'نوع الحركة',
        'تفصيل الحركة',
        'المبلغ',
        'العملة',
        'سعر الصرف',
        'الرصيد (شيكل)',
        'حالة الرصيد',
        'طريقة الدفع',
        'البنك',
        'الرقم المرجعي',
        'رقم الصندوق',
        'اسم المستخدم',
        'ملاحظات',
    ];

    /**
     * The subscriber's account statement: every charge and payment, oldest
     * first, each with the balance it left.
     */
    public function show(Request $request, Subscriber $subscriber): InertiaResponse
    {
        $this->authorize('view', $subscriber);

        $subscriber->load(['branch', 'tariff', 'tariffSegment', 'meterBox']);

        $transactions = $this->transactions($subscriber);
        $entries = $this->entries($transactions);
        $balanceInCents = $this->cents($entries->last()['balance'] ?? '0');

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
     * The statement as a spreadsheet: the same lines as the page, oldest
     * first, with the balance after each. It is a UTF-8 CSV with a byte
     * order mark, so Excel opens it with the Arabic intact.
     */
    public function export(Subscriber $subscriber): StreamedResponse
    {
        $this->authorize('view', $subscriber);

        $entries = $this->entries($this->transactions($subscriber));

        return response()->streamDownload(function () use ($entries): void {
            $output = fopen('php://output', 'w');
            fwrite($output, "\u{FEFF}");
            fputcsv($output, self::EXPORT_COLUMNS, escape: '');

            foreach ($entries as $entry) {
                $balance = (float) $entry['balance'];

                fputcsv($output, array_map($this->spreadsheetCell(...), [
                    $entry['date'],
                    $entry['voucherNumber'],
                    $entry['manualVoucherNumber'],
                    $entry['description'],
                    $entry['isPayment'] ? 'له' : 'عليه',
                    $entry['kindLabel'],
                    $entry['amount'],
                    $entry['currencyLabel'],
                    $entry['exchangeRate'],
                    number_format(abs($balance), 2, '.', ''),
                    match (true) {
                        $balance > 0 => 'عليه',
                        $balance < 0 => 'له',
                        default => 'مسدّد',
                    },
                    $entry['paymentMethodLabel'],
                    $entry['bankName'],
                    $entry['referenceNumber'],
                    $entry['cashBox'],
                    $entry['recordedByName'],
                    $entry['notes'],
                ]), escape: '');
            }

            fclose($output);
        }, "statement-{$subscriber->account_number}.csv", ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * The subscriber's charges and payments, oldest first.
     *
     * @return Collection<int, SubscriberTransaction>
     */
    private function transactions(Subscriber $subscriber): Collection
    {
        return $subscriber->transactions()
            ->with(['recordedBy', 'meterReading'])
            ->oldest()
            ->orderBy('id')
            ->get();
    }

    /**
     * The statement lines, each carrying the balance it left.
     *
     * @param  Collection<int, SubscriberTransaction>  $transactions
     * @return Collection<int, array<string, mixed>>
     */
    private function entries(Collection $transactions): Collection
    {
        $balanceInCents = 0;

        return $transactions->map(function (SubscriberTransaction $transaction) use (&$balanceInCents): array {
            $balanceInCents += $this->cents($transaction->amount);

            return $this->entry($transaction, $balanceInCents);
        });
    }

    /**
     * A value as a spreadsheet cell. Text a person typed (a note, a bank
     * name) that starts like a formula is prefixed with an apostrophe, so
     * Excel shows it instead of running it.
     */
    private function spreadsheetCell(mixed $value): string
    {
        $text = (string) $value;

        return $text !== '' && in_array($text[0], ['=', '+', '-', '@', "\t", "\r"], true) ? "'".$text : $text;
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
