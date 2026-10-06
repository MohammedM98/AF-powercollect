<?php

namespace App\Http\Requests;

use App\Enums\PermissionKey;
use App\Models\SubscriptionTransaction;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreMobileCollectionRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if ($this->has('reference_number')) {
            $this->merge(['reference_number' => trim((string) $this->input('reference_number'))]);
        }
    }

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
                'subscription_id' => ['required', Rule::exists('subscriptions', 'id')
                    ->when(! $this->user()->isSuperAdmin(), fn ($rule) => $rule->where('branch_id', $this->user()->branch_id))],
                ...StoreSubscriptionPaymentRequest::paymentRules($this->input('payment_method')),
            ]),
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return StoreSubscriptionPaymentRequest::paymentMessages();
    }

    public function existingTransaction(): ?SubscriptionTransaction
    {
        $operationId = $this->input('mobile_operation_id');

        return is_string($operationId) && $operationId !== ''
            ? SubscriptionTransaction::query()
                ->where('mobile_operation_id', $operationId)
                ->where('type', SubscriptionTransaction::TYPE_PAYMENT)
                ->first()
            : null;
    }
}
