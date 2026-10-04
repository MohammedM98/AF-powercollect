<?php

namespace App\Http\Requests;

use App\Enums\CorrectionReason;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Correcting a payment, charge, discount or clearing: the right line's
 * fields — the same as recording one of its kind — and why it is
 * corrected.
 */
class CorrectSubscriberTransactionRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->line());
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $line = $this->line();

        return [
            ...match (true) {
                $line->isPayment() => StoreSubscriberPaymentRequest::paymentRules($this->input('payment_method')),
                $line->isDiscount() => StoreSubscriberDiscountRequest::discountRules($this->input('method')),
                $line->isClearing() => StoreSubscriberClearingRequest::clearingRules(),
                default => StoreSubscriberChargeRequest::chargeRules(),
            },
            'correction_reason' => ['required', Rule::enum(CorrectionReason::class)->only(CorrectionReason::forCorrectionOf($line))],
            'correction_notes' => ['required', 'string', 'max:1000'],
        ];
    }

    /**
     * A corrected discount is checked against what the subscriber would
     * owe without the discount it replaces.
     *
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->isNotEmpty() || ! $this->line()->isDiscount()) {
                    return;
                }

                /** @var Subscriber $subscriber */
                $subscriber = $this->route('subscriber');
                $owed = round($subscriber->balance() - (float) $this->line()->amount, 2);

                StoreSubscriberDiscountRequest::checkAgainstBalance($validator, $subscriber, $owed, $this->input('method'), $this->input('value'));
            },
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            ...StoreSubscriberPaymentRequest::paymentMessages(),
            ...($this->line()->isClearing() ? StoreSubscriberClearingRequest::clearingMessages() : StoreSubscriberChargeRequest::chargeMessages()),
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return [
            'type' => 'نوع التحميل',
            'method' => 'طريقة الخصم',
            'value' => 'قيمة الخصم',
            'notes' => 'التفاصيل',
            'correction_reason' => 'سبب التصحيح',
            'correction_notes' => 'شرح التصحيح',
        ];
    }

    private function line(): SubscriberTransaction
    {
        return $this->route('transaction');
    }
}
