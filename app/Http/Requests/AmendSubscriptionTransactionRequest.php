<?php

namespace App\Http\Requests;

use App\Models\SubscriptionTransaction;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Change only a payment's descriptive details, with an audit reason. */
class AmendSubscriptionTransactionRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('amend', $this->line());
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $throughBank = $this->line()->payment_method?->throughBank() ?? false;

        return [
            'bank_name' => $throughBank
                ? ['required', Rule::in(config('powercollect.transfer_banks'))]
                : ['prohibited'],
            'sender_bank_name' => $throughBank
                ? ['nullable', Rule::in(config('powercollect.sender_banks'))]
                : ['prohibited'],
            'sender_name' => $throughBank ? ['nullable', 'string', 'max:255'] : ['prohibited'],
            // A payment's reference number is never changed after it is recorded.
            'reference_number' => ['prohibited'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'amendment_reason' => ['required', 'string', 'max:1000'],
            'amount' => ['prohibited'],
            'currency' => ['prohibited'],
            'exchange_rate' => ['prohibited'],
            'payment_method' => ['prohibited'],
            'type' => ['prohibited'],
            'subscription_id' => ['prohibited'],
            'created_at' => ['prohibited'],
            'voucher_number' => ['prohibited'],
            'manual_voucher_number' => ['prohibited'],
            'cash_box' => ['prohibited'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return [
            'bank_name' => 'البنك المحوّل له',
            'sender_bank_name' => 'البنك المحوّل منه',
            'sender_name' => 'اسم المرسل',
            'reference_number' => 'الرقم المرجعي',
            'notes' => 'الملاحظات',
            'amendment_reason' => 'سبب التعديل',
            'amount' => 'المبلغ',
            'currency' => 'العملة',
            'payment_method' => 'طريقة الدفع',
        ];
    }

    private function line(): SubscriptionTransaction
    {
        return $this->route('transaction');
    }
}
