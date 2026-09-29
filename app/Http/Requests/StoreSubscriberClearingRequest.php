<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StoreSubscriberClearingRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('adjustBalance', $this->route('subscriber'));
    }

    /**
     * `amount` is what the service is worth in shekels; `notes` says what
     * the service was.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return self::clearingRules();
    }

    /**
     * The clearing's rules; shared with correcting a clearing.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public static function clearingRules(): array
    {
        return [
            'amount' => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:1000000'],
            'notes' => ['required', 'string', 'max:1000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return self::clearingMessages();
    }

    /**
     * @return array<string, string>
     */
    public static function clearingMessages(): array
    {
        return ['notes.required' => 'اكتب الخدمة التي قدّمها المشترك؛ تظهر في كشف حسابه.'];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return ['amount' => 'قيمة الخدمة', 'notes' => 'الخدمة'];
    }
}
