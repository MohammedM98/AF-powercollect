<?php

namespace App\Http\Requests;

use App\Models\MeterReading;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class ApproveMeterReadingsRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('approveAny', MeterReading::class);
    }

    /**
     * Either the ticked readings (`reading_ids`), or `all` of the pending
     * readings matching the page's current search and filters.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'all' => ['boolean'],
            'reading_ids' => ['exclude_if:all,true', 'required', 'array', 'max:500'],
            'reading_ids.*' => ['integer', 'distinct'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'reading_ids.required' => 'اختر قراءة واحدة على الأقل لاعتمادها.',
        ];
    }
}
