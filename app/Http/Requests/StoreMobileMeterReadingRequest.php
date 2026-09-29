<?php

namespace App\Http\Requests;

use App\Models\MeterReading;

class StoreMobileMeterReadingRequest extends StoreMeterReadingRequest
{
    public function authorize(): bool
    {
        $existingReading = $this->existingReading();

        return $existingReading
            ? $existingReading->recorded_by === $this->user()->id
            : parent::authorize();
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'mobile_operation_id' => ['required', 'uuid'],
            ...($this->existingReading() ? [] : parent::rules()),
        ];
    }

    /**
     * @return array<int, callable>
     */
    public function after(): array
    {
        return $this->existingReading() ? [] : parent::after();
    }

    public function existingReading(): ?MeterReading
    {
        $operationId = $this->input('mobile_operation_id');

        return is_string($operationId) && $operationId !== ''
            ? MeterReading::query()->where('mobile_operation_id', $operationId)->first()
            : null;
    }
}
