<?php

namespace App\Http\Requests;

use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

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
     * A clearing, like a discount, cannot be worth more than what the
     * subscriber owes.
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

                /** @var Subscriber $subscriber */
                $subscriber = $this->route('subscriber');

                self::checkAgainstBalance($validator, $subscriber->balance(), $this->input('amount'));
            },
        ];
    }

    /**
     * Add an error when the clearing is worth more than `$owed`, or nothing
     * is owed; shared with correcting a clearing, where `$owed` leaves out
     * the clearing being corrected.
     */
    public static function checkAgainstBalance(Validator $validator, float $owed, float|string $amount): void
    {
        if ($owed <= 0) {
            $validator->errors()->add('amount', 'لا يوجد رصيد مستحق على المشترك لتُقاصّ منه.');
        } elseif ((float) $amount > $owed) {
            $validator->errors()->add('amount', sprintf(
                'لا يمكن أن تزيد المقاصة (%s شيكل) عن الرصيد المستحق (%s شيكل).',
                SubscriberTransaction::formatAmount($amount),
                SubscriberTransaction::formatAmount($owed),
            ));
        }
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
