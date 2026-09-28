<?php

namespace App\Http\Requests;

use App\Enums\DiscountMethod;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class UpdateSubscriberStandingDiscountRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('adjustBalance', $this->route('subscriber'));
    }

    /**
     * `value` is the percentage of each reading, the kilowatts off each
     * reading's consumption, or the shekels off the kilo price, by `method`.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'method' => ['required', Rule::enum(DiscountMethod::class)],
            'value' => [
                'required', 'numeric', 'decimal:0,2', 'gt:0',
                $this->input('method') === DiscountMethod::Percentage->value ? 'max:100' : 'max:1000000',
            ],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    /**
     * Shekels off the kilo price can't be more than the price itself.
     *
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->isNotEmpty() || $this->input('method') !== DiscountMethod::Shekel->value) {
                    return;
                }

                /** @var Subscriber $subscriber */
                $subscriber = $this->route('subscriber');
                $kiloPrice = (float) $subscriber->tariff->rate;

                if ((float) $this->input('value') > $kiloPrice) {
                    $validator->errors()->add('value', sprintf(
                        'لا يمكن أن يزيد الخصم على سعر الكيلو (%s شيكل).',
                        SubscriberTransaction::formatAmount($kiloPrice),
                    ));
                }
            },
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return ['method' => 'طريقة الخصم', 'value' => 'قيمة الخصم', 'notes' => 'التفاصيل'];
    }
}
