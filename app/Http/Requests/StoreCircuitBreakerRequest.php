<?php

namespace App\Http\Requests;

use App\Models\CircuitBreaker;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCircuitBreakerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('create', CircuitBreaker::class);
    }

    public function rules(): array
    {
        return [
            'ampere' => ['required', 'integer', 'min:1', Rule::unique('circuit_breakers', 'ampere')],
            'minimum_payment' => ['required', 'numeric', 'min:0'],
        ];
    }
}
