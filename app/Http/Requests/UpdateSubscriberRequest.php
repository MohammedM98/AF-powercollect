<?php

namespace App\Http\Requests;

use App\Enums\BillingType;
use App\Enums\SubscriberStatus;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateSubscriberRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('subscriber'));
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $subscriber = $this->route('subscriber');

        $rules = [
            'full_name' => ['required', 'string', 'max:255'],
            'phone' => ['required', 'string', 'max:30'],
            'address' => ['required', 'string', 'max:1000'],
            'meter_number' => ['required', 'string', 'max:255', Rule::unique('subscribers', 'meter_number')->ignore($subscriber->id)],
            'meter_box_id' => ['nullable', Rule::exists('meter_boxes', 'id')],
            'tariff_id' => ['required', Rule::exists('tariffs', 'id')],
            'status' => ['required', Rule::in(array_column(SubscriberStatus::cases(), 'value'))],
            'billing_type' => ['required', Rule::in(array_column(BillingType::cases(), 'value'))],
            'unit_price' => ['required', 'numeric', 'min:0'],
            'minimum_charge' => ['required', 'numeric', 'min:0'],
            'ampere_count' => ['nullable', 'integer', 'min:0'],
            'area_1_id' => ['nullable', Rule::exists('areas', 'id')],
            'area_2_id' => ['nullable', Rule::exists('areas', 'id')],
            'customer_classification' => ['nullable', 'string', 'max:255'],
            'previous_reading' => ['nullable', 'integer', 'min:0'],
            'subscription_fee' => ['nullable', 'numeric', 'min:0'],
            'subscription_date' => ['nullable', 'date'],
            'charge_subscription_fee' => ['boolean'],
            'notes' => ['required', 'string', 'max:2000'],
        ];

        if ($this->user()->isSuperAdmin()) {
            $rules['branch_id'] = ['required', Rule::exists('branches', 'id')];
        }

        return $rules;
    }
}
