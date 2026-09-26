<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Validation\Rule;

/**
 * Renames a segment. It stays under its tariff: moving it would leave its
 * subscribers with a segment that isn't one of their tariff's.
 */
class UpdateTariffSegmentRequest extends StoreTariffSegmentRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('tariff_segment'));
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $segment = $this->route('tariff_segment');

        return [
            'name' => [
                'required',
                'string',
                'max:100',
                Rule::unique('tariff_segments', 'name')->where('tariff_id', $segment->tariff_id)->ignore($segment),
            ],
        ];
    }
}
