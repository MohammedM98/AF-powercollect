<?php

namespace App\Http\Requests;

use App\Enums\Currency;
use App\Enums\PermissionKey;
use App\Enums\SubscriberStatus;
use App\Models\PaymentReceipt;
use App\Support\ReceiptText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ConfirmPaymentReceiptRequest extends FormRequest
{
    public function authorize(): bool
    {
        $receipt = $this->route('receipt');
        abort_unless($receipt instanceof PaymentReceipt && $receipt->collector_id === $this->user()->id, 404);

        return $this->user()->hasPermission(PermissionKey::RecordCollections);
    }

    protected function prepareForValidation(): void
    {
        foreach (['transaction_reference', 'sender_name', 'sender_account', 'amount', 'exchange_rate'] as $field) {
            if (is_string($this->input($field))) {
                $this->merge([$field => trim(ReceiptText::normalize($this->input($field)))]);
            }
        }
    }

    public function rules(): array
    {
        return [
            'collector_confirmed' => ['required', 'accepted'],
            'review_acknowledged' => ['required', 'accepted'],
            'subscriber_id' => ['required', 'integer', Rule::exists('subscribers', 'id')
                ->where('status', SubscriberStatus::Active->value)
                ->when(! $this->user()->isSuperAdmin(), fn ($rule) => $rule->where('branch_id', $this->user()->branch_id))],
            'provider_id' => ['required', 'integer', Rule::exists('payment_providers', 'id')->where('is_active', true)],
            'transaction_reference' => ['required', 'string', 'max:100', 'regex:/^[A-Za-z0-9][A-Za-z0-9\s\/\-]{2,99}$/'],
            'sender_name' => ['required', 'string', 'max:255'],
            'sender_account' => ['nullable', 'string', 'max:100'],
            'amount' => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:1000000'],
            'currency' => ['required', Rule::enum(Currency::class)],
            'exchange_rate' => ['exclude_if:currency,ILS', 'required', 'numeric', 'decimal:0,4', 'gt:0', 'max:1000'],
            'transferred_at' => ['required', 'date'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'collector_confirmed.accepted' => 'أكد استلام الدفعة قبل التسجيل.',
            'review_acknowledged.accepted' => 'راجع حقول الإيصال والتنبيهات قبل التسجيل.',
            'transaction_reference.required' => 'أدخل رقم التحويل من الإيصال.',
            'sender_name.required' => 'أدخل اسم المرسل من الإيصال.',
            'transferred_at.required' => 'أدخل تاريخ التحويل من الإيصال.',
        ];
    }
}
