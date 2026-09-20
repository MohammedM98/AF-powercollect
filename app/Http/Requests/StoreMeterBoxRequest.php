<?php

namespace App\Http\Requests;

use App\Models\MeterBox;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreMeterBoxRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('create', MeterBox::class);
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
            'box_number' => ['required', 'string', 'max:255', Rule::unique('meter_boxes', 'box_number')],
            'area_id' => ['nullable', Rule::exists('areas', 'id')],
            'location' => ['nullable', 'string', 'max:255'],
        ];

        if ($this->user()->isSuperAdmin()) {
            $rules['branch_id'] = ['required', Rule::exists('branches', 'id')];
        }

        return $rules;
    }
}
