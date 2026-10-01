<?php

namespace App\Http\Requests;

use App\Enums\PermissionKey;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AnalyzePaymentReceiptRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasPermission(PermissionKey::RecordCollections);
    }

    public function rules(): array
    {
        $imageRules = ['image', 'mimes:jpg,jpeg,png,webp', 'max:8192', 'dimensions:min_width=100,min_height=100,max_width=12000,max_height=12000'];

        return [
            'image' => ['required', ...$imageRules],
            'processed_image' => ['nullable', ...$imageRules],
            'provider_id' => ['nullable', 'integer', Rule::exists('payment_providers', 'id')->where('is_active', true)],
            'manual' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return ['image.required' => 'أرفق صورة الإيصال الأصلي.',
            'image.image' => 'أرفق صورة إيصال صالحة.',
            'image.max' => 'حجم صورة الإيصال يجب ألا يتجاوز 8 ميجابايت.'];
    }
}
