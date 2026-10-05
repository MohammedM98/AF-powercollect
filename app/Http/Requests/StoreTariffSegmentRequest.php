<?php

namespace App\Http\Requests;

use App\Models\TariffSegment;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTariffSegmentRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('create', TariffSegment::class);
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * A name is unique within its tariff only, so "مدارس" can exist under
     * both Residential and Commercial.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'tariff_id' => ['required', Rule::exists('tariffs', 'id')],
            'name' => [
                'required',
                'string',
                'max:100',
                Rule::unique('tariff_segments', 'name')->where('tariff_id', $this->input('tariff_id')),
            ],
        ];
    }
}
