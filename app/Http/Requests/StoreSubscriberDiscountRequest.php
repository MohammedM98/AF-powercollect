<?php

namespace App\Http\Requests;

use App\Enums\DiscountMethod;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreSubscriberDiscountRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('adjustBalance', $this->route('subscriber'));
    }

    /**
     * `value` is the percentage, the kilowatts or the shekels, by `method`.
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
     * A discount only lowers what the subscriber owes: never below zero,
     * so it can't be given when nothing is owed.
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
                $owed = $subscriber->balance();

                if ($owed <= 0) {
                    $validator->errors()->add('value', 'لا يوجد رصيد مستحق على المشترك ليُخصم منه.');

                    return;
                }

                $method = DiscountMethod::from($this->input('method'));
                $discount = SubscriberTransaction::discountFor($method, $this->input('value'), match ($method) {
                    DiscountMethod::Percentage => $owed,
                    DiscountMethod::Kilowatt => $subscriber->tariff->rate,
                    DiscountMethod::Shekel => null,
                });

                if ($discount < 0.01) {
                    $validator->errors()->add('value', 'قيمة الخصم أقل من أن تُسجَّل.');
                } elseif ($discount > $owed) {
                    $validator->errors()->add('value', sprintf(
                        'لا يمكن أن يزيد الخصم (%s شيكل) عن الرصيد المستحق (%s شيكل).',
                        SubscriberTransaction::formatAmount($discount),
                        SubscriberTransaction::formatAmount($owed),
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
