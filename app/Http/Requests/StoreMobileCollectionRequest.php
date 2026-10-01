<?php

namespace App\Http\Requests;

use App\Enums\PermissionKey;
use App\Models\SubscriberTransaction;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreMobileCollectionRequest extends FormRequest
{
    public function authorize(): bool
    {
        $existingTransaction = $this->existingTransaction();

        return $existingTransaction
            ? $existingTransaction->recorded_by === $this->user()->id
            : $this->user()->hasPermission(PermissionKey::RecordCollections);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'mobile_operation_id' => ['required', 'uuid'],
            'collector_confirmed' => ['required', 'accepted'],
            ...($this->existingTransaction() ? [] : [
                'subscriber_id' => ['required', Rule::exists('subscribers', 'id')
                    ->when(! $this->user()->isSuperAdmin(), fn ($rule) => $rule->where('branch_id', $this->user()->branch_id))],
                ...StoreSubscriberPaymentRequest::paymentRules($this->input('payment_method')),
            ]),
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return StoreSubscriberPaymentRequest::paymentMessages();
    }

    public function existingTransaction(): ?SubscriberTransaction
    {
        $operationId = $this->input('mobile_operation_id');

        return is_string($operationId) && $operationId !== ''
            ? SubscriberTransaction::query()
                ->where('mobile_operation_id', $operationId)
                ->where('type', SubscriberTransaction::TYPE_PAYMENT)
                ->first()
            : null;
    }
}
