<?php

namespace App\Http\Requests;

use App\Models\MeterReading;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateMeterReadingRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('meter_reading'));
    }

    /**
     * Only the reading itself and its notes can be corrected — the
     * subscription and week stay fixed.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'current_reading' => ['required', 'numeric', 'decimal:0,2', 'min:0', 'max:9999999999.99'],
            'notes' => ['nullable', 'string', 'max:1000'],
            // Approve it again straight away, when the corrector may (see MeterReadingController::update).
            'approve' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * A reading can only be corrected while it is the subscription's latest
     * week, since the following week starts from it.
     *
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }

                /** @var MeterReading $meterReading */
                $meterReading = $this->route('meter_reading');

                $hasLaterWeek = MeterReading::query()
                    ->where('subscription_id', $meterReading->subscription_id)
                    ->where('week_start', '>', $meterReading->week_start)
                    ->exists();

                if ($hasLaterWeek) {
                    $validator->errors()->add('current_reading', 'لا يمكن تعديل هذه القراءة لوجود قراءة لأسبوع لاحق.');

                    return;
                }

                if ($this->float('current_reading') < $meterReading->previous_reading) {
                    $validator->errors()->add('current_reading', "القراءة الحالية لا يمكن أن تكون أقل من القراءة السابقة ({$meterReading->previous_reading}).");
                }
            },
        ];
    }
}
