<?php

namespace App\Http\Requests;

use App\Enums\ChargeType;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSubscriberChargeRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('adjustBalance', $this->route('subscriber'));
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return self::chargeRules();
    }

    /**
     * The charge's rules; shared with correcting a charge.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public static function chargeRules(): array
    {
        return [
            'type' => ['required', Rule::enum(ChargeType::class)],
            'amount' => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:1000000'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return ['type' => 'نوع التحميل', 'notes' => 'التفاصيل'];
    }
}
