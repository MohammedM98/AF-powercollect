<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateMeterBoxRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('meter_box'));
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $rules = [
            'box_number' => ['required', 'string', 'max:255', Rule::unique('meter_boxes', 'box_number')->ignore($this->route('meter_box'))],
            'area_id' => ['nullable', Rule::exists('areas', 'id')],
            'location' => ['nullable', 'string', 'max:255'],
        ];

        if ($this->user()->isSuperAdmin()) {
            $rules['branch_id'] = ['required', Rule::exists('branches', 'id')];
        }

        return $rules;
    }
}
