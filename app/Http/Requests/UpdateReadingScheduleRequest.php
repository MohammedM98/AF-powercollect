<?php

namespace App\Http\Requests;

use App\Enums\ReadingEntryMode;
use App\Models\ReadingEntrySetting;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateReadingScheduleRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('manage', ReadingEntrySetting::class);
    }

    /**
     * Open days are Carbon day-of-week numbers (0 = Sunday … 6 = Saturday).
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'open_days' => ['required', 'array', 'min:1'],
            'open_days.*' => ['integer', 'between:0,6', 'distinct'],
            'mode' => ['required', Rule::enum(ReadingEntryMode::class)],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'open_days.required' => 'اختر يومًا واحدًا على الأقل لفتح الإدخال.',
            'open_days.min' => 'اختر يومًا واحدًا على الأقل لفتح الإدخال.',
        ];
    }
}
