<?php

namespace App\Support;

use App\Enums\PermissionKey;
use App\Models\Closing;
use App\Models\SubscriptionTransaction;
use App\Models\TransactionAmendment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ClosingAdjustmentService
{
    /** @return array<int, string> */
    public function availableActions(SubscriptionTransaction $transaction, User $actor): array
    {
        if ($transaction->isCancelled() || ! app(WeeklyClosingService::class)->isLocked($transaction)) {
            return [];
        }

        return array_values(array_filter([
            $actor->hasPermission(PermissionKey::CreateClosingAdjustments) ? 'correction' : null,
            $actor->hasPermission(PermissionKey::CreateClosingReversals) && $this->netEffect($transaction) !== 0 ? 'reverse' : null,
            $transaction->isPayment() && $actor->hasPermission(PermissionKey::RefundPayments) && $this->refundableCents($transaction) > 0 ? 'refund' : null,
        ]));
    }

    private function netEffect(SubscriptionTransaction $original): int
    {
        $total = Closing::cents($original->amount);
        $parents = [$original->id];
        $seen = $parents;
        while ($parents !== []) {
            $adjustments = SubscriptionTransaction::query()->whereIn('reference_transaction_id', $parents)->whereNotIn('id', $seen)->whereNotNull('adjustment_type')->get(['id', 'amount']);
            $total += $adjustments->sum(fn (SubscriptionTransaction $adjustment): int => Closing::cents($adjustment->amount));
            $parents = $adjustments->modelKeys();
            $seen = [...$seen, ...$parents];
        }

        return $total;
    }

    public function refundableCents(SubscriptionTransaction $payment): int
    {
        $refunded = SubscriptionTransaction::query()->where('reference_transaction_id', $payment->id)->where('type', SubscriptionTransaction::TYPE_REFUND)
            ->get(['amount'])->sum(fn (SubscriptionTransaction $refund): int => Closing::cents($refund->amount));

        return max(0, -$this->netEffect($payment) - $refunded);
    }

    public function adjust(SubscriptionTransaction $original, User $actor, string $type, float|string|null $correctAmount, string $reason): SubscriptionTransaction
    {
        return DB::transaction(function () use ($original, $actor, $type, $correctAmount, $reason): SubscriptionTransaction {
            app(WeeklyClosingService::class)->lock();
            $original = SubscriptionTransaction::query()->with('subscription')->lockForUpdate()->findOrFail($original->id);
            if ((! $actor->isSuperAdmin() && $actor->branch_id !== $original->subscription->branch_id)
                || ! in_array($type, $this->availableActions($original, $actor), true)) {
                throw ValidationException::withMessages(['action' => 'تصحيح أو إلغاء هذه الحركة غير مسموح.']);
            }
            if (trim($reason) === '') {
                throw ValidationException::withMessages(['amendment_reason' => 'سبب التصحيح أو الإلغاء مطلوب.']);
            }
            if ($type === 'correction' && ($correctAmount === null || ! is_numeric($correctAmount) || (float) $correctAmount < 0 || (float) $correctAmount > 1000000)) {
                throw ValidationException::withMessages(['amount' => 'أدخل القيمة الصحيحة غير السالبة.']);
            }
            $net = $this->netEffect($original);
            $target = $type === 'reverse' ? 0 : Closing::cents($correctAmount) * (Closing::cents($original->amount) < 0 ? -1 : 1);
            $delta = $target - $net;
            if ($delta === 0) {
                throw ValidationException::withMessages(['amount' => 'لا يوجد فرق مالي لتسجيله.']);
            }
            $adjustment = $original->subscription->transactions()->create([
                'recorded_by' => $actor->id, 'type' => $type === 'reverse' ? SubscriptionTransaction::TYPE_REVERSAL : SubscriptionTransaction::TYPE_CORRECTION,
                'reference_transaction_id' => $original->id, 'amount' => Closing::money($delta),
                'source_key' => 'closing-adjustment:'.Str::ulid(), 'cash_effect_amount' => '0.00',
                'adjustment_type' => $type === 'reverse' ? 'reversal' : 'correction', 'adjustment_reason' => $reason, 'notes' => $reason,
            ]);
            TransactionAmendment::create([
                'transaction_id' => $adjustment->id, 'user_id' => $actor->id, 'reason' => $reason,
                'changes' => ['action' => [null, $type === 'reverse' ? 'REVERSAL_CREATED' : 'ADJUSTMENT_CREATED'], 'original_transaction_id' => [null, $original->id], 'ledger_effect' => ['0.00', $adjustment->amount], 'cash_effect' => ['0.00', '0.00']],
            ]);

            return $adjustment;
        });
    }
}
