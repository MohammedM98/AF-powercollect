<?php

namespace App\Http\Controllers\Mobile;

use App\Enums\PaymentMethod;
use App\Enums\PermissionKey;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMobileCollectionRequest;
use App\Models\Closing;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Support\ArabicSearch;
use App\Support\ClosingPeriods;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MobileCollectionController extends Controller
{
    /** How many of the latest statement lines the subscription page shows. */
    private const RECENT_TRANSACTIONS = 10;

    public function subscriptions(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission(PermissionKey::RecordCollections), 403);

        $validated = $request->validate(['search' => ['nullable', 'string', 'max:100']]);
        $search = trim($validated['search'] ?? '');
        // Any subscription of the branch can pay, as on the website: a
        // suspended or disconnected one may still be settling their debt.
        $subscriptions = Subscription::query()
            ->visibleTo($request->user())
            ->with('meterBox:id,box_number')
            ->withSum('transactions as balance', 'amount')
            ->matchingSearch($search)
            // The account typed in full comes first, ahead of longer numbers containing it.
            ->when($search !== '', fn ($query) => $query->orderByRaw('case when account_number = ? then 0 else 1 end', [ArabicSearch::normalize($search)]))
            ->orderByDesc('balance')
            ->orderBy('id')
            ->paginate(25);

        return response()->json([
            'data' => $subscriptions->getCollection()->map(fn (Subscription $subscription): array => [
                'id' => $subscription->id,
                'full_name' => $subscription->displayName(),
                'account_number' => $subscription->account_number,
                'meter_box_number' => $subscription->meterBox?->box_number,
                'balance' => $subscription->balance ?? '0.00',
                'status' => $subscription->status->value,
                'status_label' => __($subscription->status->label()),
            ])->all(),
            'current_page' => $subscriptions->currentPage(),
            'last_page' => $subscriptions->lastPage(),
        ]);
    }

    /**
     * One subscription's account as the collector sees it before taking a
     * payment: who they are, what they owe, their last payment and the
     * latest lines of their statement, newest first.
     */
    public function show(Request $request, string $subscription): JsonResponse
    {
        abort_unless($request->user()->hasPermission(PermissionKey::RecordCollections), 403);

        $subscription = Subscription::query()
            ->visibleTo($request->user())
            ->with('meterBox:id,box_number,name,name_suffix,location')
            ->findOrFail($subscription);
        $balanceInCents = Closing::cents($subscription->balance());
        $lastPayment = $subscription->transactions()
            ->where('type', SubscriptionTransaction::TYPE_PAYMENT)
            ->whereNull('cancelled_at')
            ->latest()
            ->latest('id')
            ->first();
        $recentTransactions = $subscription->transactions()
            ->with(['meterReading', 'referenceTransaction'])
            ->latest()
            ->latest('id')
            ->limit(self::RECENT_TRANSACTIONS)
            ->get();

        // Walk back from the current balance, so each line shows the balance it left.
        $balanceAfterInCents = $balanceInCents;
        $transactions = $recentTransactions->map(function (SubscriptionTransaction $transaction) use (&$balanceAfterInCents): array {
            $entry = [
                'id' => $transaction->id,
                'date' => $transaction->created_at->toDateString(),
                'type' => $transaction->type,
                'type_label' => $transaction->typeLabel(),
                'description' => $transaction->description(),
                'amount' => Closing::money(abs(Closing::cents($transaction->amount))),
                'is_credit' => (float) $transaction->amount < 0,
                'is_cancelled' => $transaction->isCancelled(),
                'balance_after' => Closing::money($balanceAfterInCents),
            ];
            $balanceAfterInCents -= Closing::cents($transaction->amount);

            return $entry;
        });

        return response()->json([
            'subscription' => [
                'id' => $subscription->id,
                'full_name' => $subscription->displayName(),
                'account_number' => $subscription->account_number,
                'meter_box_number' => $subscription->meterBox?->box_number,
                'meter_box_name' => $subscription->meterBox?->displayName(),
                'meter_box_location' => $subscription->meterBox?->location,
                'phone' => $subscription->contactPhone(),
                'address' => $subscription->address,
                'balance' => Closing::money($balanceInCents),
                'status' => $subscription->status->value,
                'status_label' => __($subscription->status->label()),
            ],
            'last_payment' => $lastPayment ? $this->collectionData($lastPayment->setRelation('subscription', $subscription)) : null,
            'transactions' => $transactions->all(),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission(PermissionKey::RecordCollections), 403);

        // Today is the business day (in the business's time zone, up to the closing cut-off), not the UTC date.
        $day = ClosingPeriods::dayOf(now());
        [$from, $until] = ClosingPeriods::utcRange($day, $day);

        $collections = SubscriptionTransaction::query()
            ->where('recorded_by', $request->user()->id)
            ->where('type', SubscriptionTransaction::TYPE_PAYMENT)
            ->where('created_at', '>=', $from)
            ->where('created_at', '<', $until)
            ->with('subscription:id,full_name,subscription_name,account_number')
            ->latest()
            ->latest('id')
            ->get();

        // Totals are in shekels, as the account is, whatever currency each payment came in.
        return response()->json([
            'total' => $collections->sum(fn (SubscriptionTransaction $transaction): float => -(float) $transaction->amount),
            'cash_total' => $collections->filter(fn (SubscriptionTransaction $transaction): bool => $transaction->payment_method === PaymentMethod::Cash)
                ->sum(fn (SubscriptionTransaction $transaction): float => -(float) $transaction->amount),
            'data' => $collections->map(fn (SubscriptionTransaction $transaction): array => $this->collectionData($transaction))->all(),
        ]);
    }

    public function store(StoreMobileCollectionRequest $request): JsonResponse
    {
        if ($existingTransaction = $request->existingTransaction()) {
            return response()->json($this->recordedCollectionData($existingTransaction), 201);
        }

        $subscription = Subscription::query()->visibleTo($request->user())->findOrFail($request->integer('subscription_id'));
        $this->authorize('recordPayment', $subscription);
        $validated = $request->validated();

        try {
            $transaction = SubscriptionTransaction::recordPayment($subscription, $request->user(), [
                'mobile_operation_id' => $validated['mobile_operation_id'],
                'amount' => $validated['amount'],
                'currency' => $validated['currency'],
                'exchange_rate' => $validated['exchange_rate'] ?? null,
                'payment_method' => $validated['payment_method'],
                'bank_name' => $validated['bank_name'] ?? null,
                'sender_bank_name' => $validated['sender_bank_name'] ?? null,
                'sender_name' => $validated['sender_name'] ?? null,
                'reference_number' => $validated['reference_number'] ?? null,
                'confirm_duplicate_reference' => (bool) ($validated['confirm_duplicate_reference'] ?? false),
                'manual_voucher_number' => $validated['manual_voucher_number'] ?? null,
                'cash_box' => $validated['cash_box'] ?? null,
                'notes' => $validated['notes'] ?? null,
            ]);
        } catch (UniqueConstraintViolationException $exception) {
            $transaction = $request->existingTransaction();

            if (! $transaction) {
                throw $exception;
            }

            abort_unless($transaction->recorded_by === $request->user()->id, 403);
        }

        return response()->json($this->recordedCollectionData($transaction), 201);
    }

    /**
     * A payment just recorded, with the subscription's balance after it, as
     * the website's receipt shows it.
     *
     * @return array<string, mixed>
     */
    private function recordedCollectionData(SubscriptionTransaction $transaction): array
    {
        $transaction->load('subscription');

        return [
            ...$this->collectionData($transaction),
            'balance_after' => number_format($transaction->subscription->balance(), 2, '.', ''),
        ];
    }

    /**
     * The amount is in the currency it was paid in; `amount_in_shekels` is
     * what it took off the balance.
     *
     * @return array{id: int, subscription: string, amount: string, currency: string, exchange_rate: ?string, amount_in_shekels: string, payment_method: string, bank_name: ?string, sender_bank_name: ?string, status: string, recorded_at: string, voucher_number: ?string}
     */
    private function collectionData(SubscriptionTransaction $transaction): array
    {
        return [
            'id' => $transaction->id,
            'subscription' => $transaction->subscription->displayName(),
            'amount' => $transaction->currency_amount,
            'currency' => $transaction->currency->value,
            'exchange_rate' => $transaction->exchange_rate,
            'amount_in_shekels' => number_format(-(float) $transaction->amount, 2, '.', ''),
            'payment_method' => $transaction->payment_method->value,
            'bank_name' => $transaction->bank_name,
            'sender_bank_name' => $transaction->sender_bank_name,
            'status' => 'recorded',
            'recorded_at' => $transaction->created_at->toIso8601String(),
            'voucher_number' => $transaction->printedVoucherNumber(),
        ];
    }
}
