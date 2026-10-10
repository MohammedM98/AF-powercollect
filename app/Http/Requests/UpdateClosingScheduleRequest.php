<?php

namespace App\Http\Requests;

use App\Models\ClosingSetting;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateClosingScheduleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('manage', ClosingSetting::class);
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'cutoff_time' => ['required', 'date_format:H:i'],
            'week_starts_on' => ['required', 'integer', 'between:0,6'],
            'auto_open' => ['required', 'boolean'],
        ];
    }

    /**
     * The day closes at midnight, or at a time from noon on: an earlier
     * cut-off would cut the working day itself in two.
     *
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $cutoff = (string) $this->input('cutoff_time');

                if (! $validator->errors()->has('cutoff_time') && $cutoff !== '00:00' && $cutoff < '12:00') {
                    $validator->errors()->add('cutoff_time', 'اختر منتصف الليل (00:00) أو وقتًا من الظهر (12:00) فما بعد.');
                }
            },
        ];
    }
}
