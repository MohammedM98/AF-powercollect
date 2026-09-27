<?php

namespace App\Http\Requests;

use App\Enums\Currency;
use App\Enums\PaymentMethod;
use App\Models\SubscriberTransaction;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSubscriberPaymentRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('recordPayment', $this->route('subscriber'));
    }

    /**
     * A shekel payment needs no exchange rate; a bank transfer needs one of
     * the transfer banks and its number; the cash box only applies to cash.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $throughBank = PaymentMethod::tryFrom((string) $this->input('payment_method'))?->throughBank() ?? false;

        return [
            'amount' => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:1000000'],
            'currency' => ['required', Rule::enum(Currency::class)],
            'exchange_rate' => ['exclude_if:currency,'.Currency::Shekel->value, 'required', 'numeric', 'decimal:0,4', 'gt:0', 'max:1000'],
            'payment_method' => ['required', Rule::enum(PaymentMethod::class)->only(PaymentMethod::offered())],
            'bank_name' => ['exclude_unless:payment_method,'.PaymentMethod::BankTransfer->value, 'required', Rule::in(config('powercollect.transfer_banks'))],
            'reference_number' => ['exclude_if:payment_method,'.PaymentMethod::Cash->value, Rule::requiredIf($throughBank), 'nullable', 'string', 'max:100'],
            'cash_box' => ['exclude_unless:payment_method,'.PaymentMethod::Cash->value, 'nullable', 'string', 'max:20'],
            'manual_voucher_number' => ['nullable', 'string', 'max:50'],
            'notes' => ['nullable', 'string', 'max:1000'],
            // What the payment is for: the subscriber's own charges.
            'charge_ids' => ['nullable', 'array'],
            'charge_ids.*' => [
                'integer',
                'distinct',
                Rule::exists('subscriber_transactions', 'id')
                    ->where('subscriber_id', $this->route('subscriber')->id)
                    ->whereNotIn('type', SubscriberTransaction::CREDIT_TYPES),
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'bank_name.required' => 'اختر البنك أو المحفظة التي حُوّل إليها المبلغ.',
            'bank_name.in' => 'اختر أحد البنوك أو المحافظ المتاحة.',
            'charge_ids.*' => 'أحد البنود المختارة لا يخص هذا المشترك.',
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return ['notes' => 'الملاحظات'];
    }
}
