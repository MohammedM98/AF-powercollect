<?php

namespace App\Http\Requests;

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
            'national_id' => ['required', 'string', 'regex:/^\d{9}$/', Rule::unique('subscribers', 'national_id')->ignore($subscriber->id)],
            'phone' => ['required', 'string', 'max:30'],
            'address' => ['required', 'string', 'max:1000'],
            'meter_box_id' => ['nullable', Rule::exists('meter_boxes', 'id')],
            'tariff_id' => ['required', Rule::exists('tariffs', 'id')],
            'status' => ['required', Rule::in(array_column(SubscriberStatus::cases(), 'value'))],
            'circuit_breaker_id' => ['nullable', Rule::exists('circuit_breakers', 'id')],
            'minimum_charge' => ['required', 'numeric', 'min:0'],
            'initial_reading' => ['required', 'integer', 'min:0'],
            'subscription_fee' => ['nullable', 'numeric', 'min:0'],
            'subscription_date' => ['nullable', 'date'],
            'notes' => ['required', 'string', 'max:2000'],
        ];

        if ($this->user()->isSuperAdmin()) {
            $rules['branch_id'] = ['required', Rule::exists('branches', 'id')];
        }

        return $rules;
    }
}
