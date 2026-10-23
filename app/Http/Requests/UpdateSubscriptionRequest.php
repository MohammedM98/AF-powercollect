<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;

/**
 * The rules of StoreSubscriptionRequest, with the authorization of an
 * update. The edit form shows the subscription's own mobile number, not
 * the person's shared one (that is changed in their personal details), so
 * the shared one may be empty here as long as the subscription has its own.
 */
class UpdateSubscriptionRequest extends StoreSubscriptionRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('subscription'));
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            ...parent::rules(),
            'phone' => ['nullable', 'string', 'regex:/\A05[69][0-9]{7}\z/'],
            'subscription_phone' => ['required_without:phone', 'nullable', 'string', 'regex:/\A05[69][0-9]{7}\z/'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            ...parent::messages(),
            'subscription_phone.required_without' => 'أدخل رقم الجوال.',
        ];
    }
}
