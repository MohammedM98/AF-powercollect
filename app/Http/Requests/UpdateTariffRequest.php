<?php

namespace App\Http\Requests;

use App\Enums\TariffCategory;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateTariffRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('tariff'));
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'category' => [
                'required',
                Rule::in(array_column(TariffCategory::cases(), 'value')),
                Rule::unique('tariffs', 'category')->ignore($this->route('tariff')),
            ],
            'rate' => ['required', 'numeric', 'min:0'],
        ];
    }
}
