<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCircuitBreakerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('circuit_breaker'));
    }

    public function rules(): array
    {
        return [
            'ampere' => ['required', 'integer', 'min:1', Rule::unique('circuit_breakers', 'ampere')->ignore($this->route('circuit_breaker')->id)],
            'minimum_payment' => ['required', 'numeric', 'min:0'],
        ];
    }
}
