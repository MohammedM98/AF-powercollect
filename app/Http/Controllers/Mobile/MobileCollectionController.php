<?php

namespace App\Http\Controllers\Mobile;

use App\Enums\PaymentMethod;
use App\Enums\PermissionKey;
use App\Enums\SubscriberStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMobileCollectionRequest;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MobileCollectionController extends Controller
{
    public function subscribers(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission(PermissionKey::RecordCollections), 403);

        $validated = $request->validate(['search' => ['nullable', 'string', 'max:100']]);
        $search = trim($validated['search'] ?? '');
        $subscribers = Subscriber::query()
            ->visibleTo($request->user())
            ->where('status', SubscriberStatus::Active)
            ->with('meterBox:id,box_number')
            ->withSum('transactions as balance', 'amount')
            ->when($search !== '', fn ($query) => $query->where(fn ($matching) => $matching
                ->where('full_name', 'like', '%'.$search.'%')
                ->orWhere('account_number', 'like', '%'.$search.'%')
                ->orWhereHas('meterBox', fn ($box) => $box->where('box_number', 'like', '%'.$search.'%'))))
            ->orderByDesc('balance')
            ->orderBy('id')
            ->paginate(25);

        return response()->json([
            'data' => $subscribers->getCollection()->map(fn (Subscriber $subscriber): array => [
                'id' => $subscriber->id,
                'full_name' => $subscriber->full_name,
                'account_number' => $subscriber->account_number,
                'meter_box_number' => $subscriber->meterBox?->box_number,
                'balance' => $subscriber->balance ?? '0.00',
            ])->all(),
            'current_page' => $subscribers->currentPage(),
            'last_page' => $subscribers->lastPage(),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission(PermissionKey::RecordCollections), 403);

        $collections = SubscriberTransaction::query()
            ->where('recorded_by', $request->user()->id)
            ->where('type', SubscriberTransaction::TYPE_PAYMENT)
            ->whereDate('created_at', today())
            ->with('subscriber:id,full_name,account_number')
            ->latest()
            ->latest('id')
            ->get();

        return response()->json([
            'total' => $collections->sum(fn (SubscriberTransaction $transaction): float => (float) $transaction->currency_amount),
            'cash_total' => $collections->filter(fn (SubscriberTransaction $transaction): bool => $transaction->payment_method === PaymentMethod::Cash)
                ->sum(fn (SubscriberTransaction $transaction): float => (float) $transaction->currency_amount),
            'data' => $collections->map(fn (SubscriberTransaction $transaction): array => $this->collectionData($transaction))->all(),
        ]);
    }

    public function store(StoreMobileCollectionRequest $request): JsonResponse
    {
        if ($existingTransaction = $request->existingTransaction()) {
            return response()->json($this->collectionData($existingTransaction->load('subscriber')), 201);
        }

        $subscriber = Subscriber::query()->visibleTo($request->user())->findOrFail($request->integer('subscriber_id'));
        $this->authorize('recordPayment', $subscriber);
        $validated = $request->validated();

        try {
            $transaction = SubscriberTransaction::recordPayment($subscriber, $request->user(), [
                'mobile_operation_id' => $validated['mobile_operation_id'],
                'amount' => $validated['amount'],
                'currency' => $validated['currency'],
                'payment_method' => $validated['payment_method'],
                'bank_name' => $validated['bank_name'] ?? null,
                'sender_name' => $validated['sender_name'] ?? null,
                'reference_number' => $validated['reference_number'] ?? null,
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

        return response()->json($this->collectionData($transaction->load('subscriber')), 201);
    }

    /**
     * @return array{id: int, subscriber: string, amount: string, payment_method: string, status: string, recorded_at: string, voucher_number: ?string}
     */
    private function collectionData(SubscriberTransaction $transaction): array
    {
        return [
            'id' => $transaction->id,
            'subscriber' => $transaction->subscriber->full_name,
            'amount' => $transaction->currency_amount,
            'payment_method' => $transaction->payment_method->value,
            'status' => 'recorded',
            'recorded_at' => $transaction->created_at->toIso8601String(),
            'voucher_number' => $transaction->printedVoucherNumber(),
        ];
    }
}
