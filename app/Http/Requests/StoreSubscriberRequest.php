<?php

namespace App\Http\Requests;

use App\Enums\SubscriberStatus;
use App\Models\Subscriber;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSubscriberRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('create', Subscriber::class);
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * UpdateSubscriberRequest reuses these rules; there, `->ignore()` lets the
     * record being edited keep its own unique value (on create there is no
     * route model, so nothing is ignored).
     *
     * Only a Super Admin may choose the branch — the controller forces it
     * to the actor's own branch for everyone else, so branch_id isn't
     * validated for them at all.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $rules = [
            'full_name' => ['required', 'string', 'max:255'],
            'national_id' => ['required', 'string', 'regex:/^\d{9}$/', Rule::unique('subscribers', 'national_id')->ignore($this->route('subscriber'))],
            'phone' => ['required', 'string', 'regex:/\A05[69][0-9]{7}\z/'],
            'address' => ['nullable', 'string', 'max:1000'],
            'meter_box_id' => ['nullable', Rule::exists('meter_boxes', 'id')],
            'tariff_id' => ['required', Rule::exists('tariffs', 'id')],
            'status' => ['required', Rule::enum(SubscriberStatus::class)],
            'circuit_breaker_id' => ['nullable', Rule::exists('circuit_breakers', 'id')],
            'minimum_charge' => ['required', 'numeric', 'min:0'],
            'initial_reading' => ['required', 'integer', 'min:0'],
            'subscription_fee' => ['nullable', 'numeric', 'min:0'],
            'subscription_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];

        if ($this->user()->isSuperAdmin()) {
            $rules['branch_id'] = ['required', Rule::exists('branches', 'id')];
        }

        return $rules;
    }
}
