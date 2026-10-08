<?php

namespace App\Http\Controllers;

use App\Enums\PaymentMethod;
use App\Http\Requests\StoreSplitPaymentRequest;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Support\ClosingPeriods;
use App\Support\DailySeries;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class PaymentController extends Controller
{
    /** The most subscriptions a search lists; a longer list asks the user to narrow the search. */
    private const RESULT_LIMIT = 12;

    /** The payments listed under the day's totals. */
    private const RECENT_PAYMENTS = 8;

    /**
     * The quick payments page: search for a subscription and record its
     * payment, with what the user collected today under it. It takes only the
     * "Record Collections" permission, so it works for someone who cannot open
     * the subscriptions list.
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('recordAnyPayment', Subscription::class);

        $actor = $request->user();
        $search = trim((string) $request->query('search', ''));
        $found = $search === '' ? collect() : $this->matching($actor, $search);

        return Inertia::render('Payments/Index', [
            'search' => $search,
            'subscriptions' => $found->take(self::RESULT_LIMIT)->map(fn (Subscription $subscription): array => $this->row($subscription))->values(),
            'hasMoreSubscriptions' => $found->count() > self::RESULT_LIMIT,
            'today' => $this->todaysPayments($actor),
            'paymentMethods' => PaymentMethod::options(PaymentMethod::offered()),
            'transferBanks' => config('powercollect.transfer_banks'),
            'senderBanks' => config('powercollect.sender_banks'),
        ]);
    }

    /**
     * The split payment form's search, as JSON: the subscriptions matching
     * `?search=`, or — with `?siblings_of=` — the other subscriptions under
     * the same identity number as that one, so a payer's accounts are added
     * to the split together.
     */
    public function search(Request $request): JsonResponse
    {
        $this->authorize('recordAnyPayment', Subscription::class);

        $actor = $request->user();
        $siblingsOf = $request->query('siblings_of');

        if (is_string($siblingsOf) && ctype_digit($siblingsOf)) {
            $source = Subscription::query()->visibleTo($actor)->findOrFail($siblingsOf);
            $found = $source->subscriber_profile_id === null ? collect() : Subscription::query()
                ->visibleTo($actor)
                ->with(['branch', 'meterBox', 'circuitBreaker', 'profile'])
                ->withSum('transactions as outstanding_balance', 'amount')
                ->where('subscriber_profile_id', $source->subscriber_profile_id)
                ->whereKeyNot($source->id)
                ->orderBy('account_number')
                ->limit(StoreSplitPaymentRequest::MAX_PARTS)
                ->get();

            return response()->json(['subscriptions' => $found->map(fn (Subscription $subscription): array => $this->row($subscription))->values(), 'hasMore' => false]);
        }

        $search = trim((string) $request->query('search', ''));
        $found = $search === '' ? collect() : $this->matching($actor, $search);

        return response()->json([
            'subscriptions' => $found->take(self::RESULT_LIMIT)->map(fn (Subscription $subscription): array => $this->row($subscription))->values(),
            'hasMore' => $found->count() > self::RESULT_LIMIT,
        ]);
    }

    /**
     * The subscriptions of the user's branch (any branch for the Super Admin)
     * whose name, account name, account or old number or meter box number
     * match every word of the search, or whose phone contains its digits.
     *
     * @return Collection<int, Subscription>
     */
    private function matching(User $actor, string $search): Collection
    {
        $digits = preg_replace('/\D/', '', $search);

        return Subscription::query()
            ->visibleTo($actor)
            ->with(['branch', 'meterBox', 'circuitBreaker', 'profile'])
            ->withSum('transactions as outstanding_balance', 'amount')
            ->where(function (Builder $matching) use ($search, $digits): void {
                $matching->matchingSearch($search);

                if (strlen($digits) >= 3) {
                    $matching->orWhere('phone', 'like', '%'.$digits.'%')->orWhere('subscription_phone', 'like', '%'.$digits.'%');
                }
            })
            ->orderBy('full_name')
            ->limit(self::RESULT_LIMIT + 1)
            ->get();
    }

    /**
     * One search result: who, where, and what they owe, in the shape the
     * payment form reads.
     *
     * @return array<string, mixed>
     */
    private function row(Subscription $subscription): array
    {
        return [
            'id' => $subscription->id,
            'fullName' => $subscription->displayName(),
            'accountNumber' => $subscription->account_number,
            'subscriberNumber' => $subscription->profile?->subscriber_number,
            'phone' => $subscription->contactPhone(),
            'meterBoxNumber' => $subscription->meterBox?->box_number,
            'branchName' => $subscription->branch->name,
            'status' => $subscription->status->value,
            'statusLabel' => __($subscription->status->label()),
            'balance' => number_format((float) ($subscription->outstanding_balance ?? 0), 2, '.', ''),
            'weeklyMinimumPayment' => $subscription->weeklyMinimumPayment(),
        ];
    }

    /**
     * What the user has collected in the current business day: the totals
     * (cancelled payments left out), and their latest payments.
     *
     * @return array{count: int, total: string, cash: string, transfers: string, payments: array<int, array<string, mixed>>}
     */
    private function todaysPayments(User $actor): array
    {
        $day = ClosingPeriods::dayOf(now());
        [$from, $until] = ClosingPeriods::utcRange($day, $day);

        $payments = SubscriptionTransaction::query()
            ->where('type', SubscriptionTransaction::TYPE_PAYMENT)
            ->whereNull('cancelled_at')
            ->where('recorded_by', $actor->id)
            ->where('created_at', '>=', $from)
            ->where('created_at', '<', $until)
            ->with('subscription')
            ->latest('id')
            ->get();

        $sumOf = fn (Collection $lines): string => number_format($lines->sum(fn (SubscriptionTransaction $payment): float => -(float) $payment->amount), 2, '.', '');
        $cash = $payments->filter(fn (SubscriptionTransaction $payment): bool => $payment->payment_method === PaymentMethod::Cash);

        return [
            'count' => $payments->count(),
            'total' => $sumOf($payments),
            'cash' => $sumOf($cash),
            'transfers' => $sumOf($payments->reject(fn (SubscriptionTransaction $payment): bool => $payment->payment_method === PaymentMethod::Cash)),
            'payments' => $payments->take(self::RECENT_PAYMENTS)->map(fn (SubscriptionTransaction $payment): array => [
                'id' => $payment->id,
                'subscriptionName' => $payment->subscription->displayName(),
                'amount' => SubscriptionTransaction::formatAmount(ltrim($payment->amount, '-')),
                'methodLabel' => $payment->payment_method ? __($payment->payment_method->label()) : null,
                'bankName' => $payment->bank_name,
                'voucherNumber' => $payment->displayVoucherNumber(),
                'time' => DailySeries::localTime($payment->created_at),
                'receiptUrl' => route('subscriptions.payments.receipt', [$payment->subscription, $payment]),
            ])->values()->all(),
        ];
    }
}
