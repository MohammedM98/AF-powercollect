<?php

namespace App\Http\Requests;

use App\Enums\Currency;
use App\Enums\PaymentMethod;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSubscriberPaymentRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        if ($this->has('reference_number')) {
            $this->merge(['reference_number' => trim((string) $this->input('reference_number'))]);
        }
    }

    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('recordPayment', $this->route('subscriber'));
    }

    /**
     * A shekel payment needs no exchange rate; a bank transfer needs one of
     * the transfer banks and who sent it (its reference number is optional) (the subscriber or
     * someone else); the cash box and the paper voucher only apply to cash.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return self::paymentRules($this->input('payment_method'));
    }

    /**
     * The payment's rules, for a payment made by `$paymentMethod`; shared
     * with correcting a payment.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public static function paymentRules(mixed $paymentMethod): array
    {
        return [
            'amount' => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:1000000'],
            'currency' => ['required', Rule::enum(Currency::class)],
            'exchange_rate' => ['exclude_if:currency,'.Currency::Shekel->value, 'required', 'numeric', 'decimal:0,4', 'gt:0', 'max:1000'],
            'payment_method' => ['required', Rule::enum(PaymentMethod::class)->only(PaymentMethod::offered())],
            'bank_name' => ['exclude_unless:payment_method,'.PaymentMethod::BankTransfer->value, 'required', Rule::in(config('powercollect.transfer_banks'))],
            'sender_bank_name' => ['exclude_unless:payment_method,'.PaymentMethod::BankTransfer->value, 'nullable', Rule::in(config('powercollect.sender_banks'))],
            'sender_name' => ['exclude_unless:payment_method,'.PaymentMethod::BankTransfer->value, 'required', 'string', 'max:255'],
            'reference_number' => ['exclude_if:payment_method,'.PaymentMethod::Cash->value, 'nullable', 'string', 'max:100'],
            // Sent once the collector confirmed that the reference is already on another payment.
            'confirm_duplicate_reference' => ['sometimes', 'boolean'],
            'cash_box' => ['exclude_unless:payment_method,'.PaymentMethod::Cash->value, 'nullable', 'string', 'max:20'],
            'manual_voucher_number' => ['exclude_unless:payment_method,'.PaymentMethod::Cash->value, 'nullable', 'string', 'max:50'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return self::paymentMessages();
    }

    /**
     * @return array<string, string>
     */
    public static function paymentMessages(): array
    {
        return [
            'bank_name.required' => 'اختر البنك أو المحفظة التي حُوّل إليها المبلغ.',
            'bank_name.in' => 'اختر أحد البنوك أو المحافظ المتاحة.',
            'sender_bank_name.in' => 'اختر أحد البنوك أو المحافظ المتاحة للتحويل منه.',
            'sender_name.required' => 'أدخل اسم صاحب الحساب الذي حُوّل منه المبلغ.',
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
