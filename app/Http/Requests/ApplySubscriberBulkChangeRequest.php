<?php

namespace App\Http\Requests;

use App\Enums\SubscriberStatus;
use App\Models\Subscriber;
use App\Models\SubscriberBulkChange;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * One field set for many subscribers: the ticked ones (`ids`), or every
 * subscriber matching the list's search and filters (`all`, sent with the
 * list's own `search` and `filter`).
 */
class ApplySubscriberBulkChangeRequest extends FormRequest
{
    /** The most subscribers one bulk change may reach. */
    public const MAX_SUBSCRIBERS = 5000;

    public function authorize(): bool
    {
        return $this->user()->can('bulkUpdate', [Subscriber::class, (string) $this->input('field')]);
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $isMinimum = $this->input('field') === 'minimum_charge';

        return [
            'field' => ['required', Rule::in(SubscriberBulkChange::FIELDS)],
            'mode' => [Rule::requiredIf($isMinimum), Rule::in(['amount', 'circuit_breaker'])],
            'value' => $isMinimum
                ? [Rule::requiredIf($this->input('mode') === 'amount'), 'nullable', 'numeric', 'min:0', 'max:100000']
                : ['required', Rule::enum(SubscriberStatus::class)],
            'all' => ['boolean'],
            'ids' => ['exclude_if:all,true', 'required', 'array', 'min:1', 'max:'.self::MAX_SUBSCRIBERS],
            'ids.*' => ['integer'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'ids.required' => 'اختر مشتركًا واحدًا على الأقل.',
            'ids.max' => 'يمكن تعديل '.self::MAX_SUBSCRIBERS.' مشترك على الأكثر في المرة الواحدة.',
            'value.required' => 'أدخل القيمة الجديدة.',
        ];
    }
}
