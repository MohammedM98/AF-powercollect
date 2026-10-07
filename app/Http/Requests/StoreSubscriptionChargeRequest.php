<?php

namespace App\Http\Requests;

use App\Enums\ChargeType;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSubscriptionChargeRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('adjustBalance', $this->route('subscription'));
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return self::chargeRules($this->input('type'));
    }

    /**
     * The charge's rules, for a charge of `$type`; shared with correcting a
     * charge. A subscription fee has the same limit as at registration.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public static function chargeRules(mixed $type = null): array
    {
        $most = $type === ChargeType::SubscriptionFee->value ? config('powercollect.limits.subscription_fee') : 1000000;

        return [
            'type' => ['required', Rule::enum(ChargeType::class)],
            'amount' => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:'.$most],
            'notes' => ['required_if:type,'.ChargeType::Penalty->value, 'nullable', 'string', 'max:1000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return self::chargeMessages();
    }

    /**
     * @return array<string, string>
     */
    public static function chargeMessages(): array
    {
        return ['notes.required_if' => 'اكتب سبب الغرامة؛ يظهر في كشف حساب المشترك.'];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return ['type' => 'نوع التحميل', 'notes' => 'التفاصيل'];
    }
}
