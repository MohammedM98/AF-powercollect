<?php

namespace App\Http\Controllers;

use App\Enums\ChargeType;
use App\Enums\CorrectionReason;
use App\Enums\DiscountMethod;
use App\Http\Requests\AmendSubscriberTransactionRequest;
use App\Http\Requests\ApplySubscriberTransactionActionRequest;
use App\Http\Requests\CorrectSubscriberTransactionRequest;
use App\Http\Requests\DeleteSubscriberTransactionRequest;
use App\Http\Requests\ForceDeleteSubscriberTransactionRequest;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Notifications\ActionCompleted;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;

/**
 * Amending details, correcting money, cancelling or permanently erasing a
 * subscriber transaction. Each action preserves the financial audit trail
 * appropriate to what changed.
 */
class SubscriberTransactionController extends Controller
{
    /** Apply one of the five canonical ledger actions. */
    public function apply(
        ApplySubscriberTransactionActionRequest $request,
        Subscriber $subscriber,
        SubscriberTransaction $transaction,
    ): RedirectResponse {
        $action = $request->action();
        $summary = sprintf('%s — %s', $subscriber->displayName(), $transaction->description());

        $transaction->applyAction($request->user(), $action, $request->validated());

        $request->user()->notify(new ActionCompleted('transaction-'.$action->value, $summary));

        return back()->with('status', 'transaction-'.$action->value);
    }

    /** Amend non-financial payment details in place and keep their history. */
    public function amend(AmendSubscriberTransactionRequest $request, Subscriber $subscriber, SubscriberTransaction $transaction): RedirectResponse
    {
        $transaction->amend(
            $request->user(),
            $request->safe()->except(['amendment_reason']),
            $request->validated('amendment_reason'),
        );

        $request->user()->notify(new ActionCompleted(
            'transaction-amended',
            sprintf('%s — دفعة%s', $subscriber->displayName(), $transaction->printedVoucherNumber() ? ' · السند '.$transaction->printedVoucherNumber() : ''),
        ));

        return back()->with('status', 'transaction-amended');
    }

    /**
     * Correct the line: cancel it and record the right one. A corrected
     * payment gets a new voucher number, shown on its receipt with the
     * balance it left.
     */
    public function update(CorrectSubscriberTransactionRequest $request, Subscriber $subscriber, SubscriberTransaction $transaction): RedirectResponse
    {
        $actor = $request->user();
        $details = $request->safe()->except(['correction_reason', 'correction_notes']);

        $replacement = $transaction->correct(
            $actor,
            CorrectionReason::from($request->validated('correction_reason')),
            $request->validated('correction_notes'),
            fn (Subscriber $subscriber): SubscriberTransaction => match (true) {
                $transaction->isPayment() => SubscriberTransaction::recordPayment($subscriber, $actor, $details),
                $transaction->isDiscount() => SubscriberTransaction::recordDiscount($subscriber, $actor, DiscountMethod::from($details['method']), $details['value'], $details['notes'] ?? null),
                $transaction->isClearing() => SubscriberTransaction::recordClearing($subscriber, $actor, $details['amount'], $details['notes']),
                default => SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::from($details['type']), $details['amount'], $details['notes'] ?? null),
            },
        );

        $actor->notify(new ActionCompleted(
            'transaction-corrected',
            sprintf('%s — %s %s شيكل', $subscriber->displayName(), $replacement->typeLabel(), SubscriberTransaction::formatAmount(ltrim($replacement->amount, '-'))),
        ));

        if ($replacement->isPayment()) {
            Inertia::flash('recordedPayment', [
                'voucherNumber' => $replacement->printedVoucherNumber(),
                'balance' => number_format($subscriber->balance(), 2, '.', ''),
                'receiptUrl' => route('subscribers.payments.receipt', [$subscriber, $replacement]),
            ]);
        }

        return back()->with('status', 'transaction-corrected');
    }

    /**
     * Cancel the line, and add the reversal that takes its
     * amount back off the balance.
     */
    public function destroy(DeleteSubscriberTransactionRequest $request, Subscriber $subscriber, SubscriberTransaction $transaction): RedirectResponse
    {
        $transaction->cancel(
            $request->user(),
            CorrectionReason::from($request->validated('correction_reason')),
            $request->validated('correction_notes'),
        );

        $request->user()->notify(new ActionCompleted(
            'transaction-deleted',
            sprintf('%s — %s %s شيكل', $subscriber->displayName(), $transaction->typeLabel(), SubscriberTransaction::formatAmount(ltrim($transaction->amount, '-'))),
        ));

        return back()->with('status', 'transaction-deleted');
    }

    /**
     * Erase the line for good: nothing is kept on the statement, and the
     * balance is as if it was never recorded.
     */
    public function forceDestroy(ForceDeleteSubscriberTransactionRequest $request, Subscriber $subscriber, SubscriberTransaction $transaction): RedirectResponse
    {
        $summary = sprintf('%s — %s %s شيكل', $subscriber->displayName(), $transaction->typeLabel(), SubscriberTransaction::formatAmount(ltrim($transaction->amount, '-')));

        $transaction->erase($request->user(), $request->validated('correction_notes'));

        $request->user()->notify(new ActionCompleted('transaction-erased', $summary));

        return back()->with('status', 'transaction-erased');
    }
}
