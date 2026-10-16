<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;

/**
 * The last reading as it would be edited, checked as the edit itself is
 * (UpdateMeterReadingRequest) so its preview shows only what could be saved.
 */
class PreviewLastReadingRequest extends UpdateMeterReadingRequest
{
    /**
     * Only whoever may edit the reading as the last reading sees the preview.
     */
    public function authorize(): bool
    {
        return $this->user()->can('updateAsLastReading', $this->route('meter_reading'));
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'current_reading' => ['required', 'numeric', 'decimal:0,2', 'min:0', 'max:9999999999.99'],
        ];
    }
}
