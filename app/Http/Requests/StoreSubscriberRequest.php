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
            'phone' => ['nullable', 'string', 'max:30'],
            'address' => ['nullable', 'string', 'max:1000'],
            'meter_number' => ['required', 'string', 'max:255', Rule::unique('subscribers', 'meter_number')],
            'meter_box_id' => ['nullable', Rule::exists('meter_boxes', 'id')],
            'tariff_id' => ['required', Rule::exists('tariffs', 'id')],
            'status' => ['required', Rule::in(array_column(SubscriberStatus::cases(), 'value'))],
        ];

        if ($this->user()->isSuperAdmin()) {
            $rules['branch_id'] = ['required', Rule::exists('branches', 'id')];
        }

        return $rules;
    }
}
