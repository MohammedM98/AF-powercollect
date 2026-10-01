<?php

namespace App\Http\Requests;

use App\Enums\Currency;
use App\Models\ReceiptExample;
use App\Support\ReceiptText;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SaveReceiptExampleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('manage', ReceiptExample::class);
    }

    protected function prepareForValidation(): void
    {
        $fields = $this->input('verified_fields');
        if (is_array($fields)) {
            foreach ($fields as $key => $value) {
                if (is_string($value)) {
                    $fields[$key] = trim(ReceiptText::normalize($value));
                }
            }
            if (is_string($fields['amount'] ?? null)) {
                $fields['amount'] = ReceiptText::amount($fields['amount']) ?? $fields['amount'];
            }
            $this->merge(['verified_fields' => $fields]);
        }
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:150'],
            'layout' => ['required', 'string', 'max:100'],
            'purpose' => ['required', Rule::in(['tuning', 'evaluation'])],
            'provider_id' => ['required', 'integer', Rule::exists('payment_providers', 'id')->where('is_active', true)],
            'image' => $this->route('receiptExample') ? ['prohibited'] : ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192', 'dimensions:min_width=100,min_height=100,max_width=12000,max_height=12000'],
            'verified_fields' => ['required', 'array:transaction_reference,sender_name,sender_account,amount,currency,transferred_at'],
            'verified_fields.transaction_reference' => ['required', 'string', 'max:100', 'regex:/^[A-Za-z0-9][A-Za-z0-9\s\/\-]{2,99}$/'],
            'verified_fields.sender_name' => ['required', 'string', 'max:255'],
            'verified_fields.sender_account' => ['nullable', 'string', 'max:100'],
            'verified_fields.amount' => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:1000000'],
            'verified_fields.currency' => ['required', Rule::enum(Currency::class)],
            'verified_fields.transferred_at' => ['required', 'date_format:Y-m-d'],
        ];
    }

    public function attributes(): array
    {
        return ['title' => 'اسم المثال', 'layout' => 'نوع الإيصال', 'image' => 'صورة الإيصال',
            'verified_fields.transaction_reference' => 'رقم التحويل', 'verified_fields.sender_name' => 'اسم المرسل',
            'verified_fields.sender_account' => 'حساب المرسل', 'verified_fields.amount' => 'المبلغ',
            'verified_fields.currency' => 'العملة', 'verified_fields.transferred_at' => 'تاريخ التحويل'];
    }
}
