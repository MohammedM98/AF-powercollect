<?php

namespace App\Http\Requests;

use App\Enums\SubscriberStatus;
use App\Models\Subscriber;
use App\Models\SubscriberProfile;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSubscriberRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('create', Subscriber::class)
            && (! $this->filled('source_subscriber_id') || $this->sourceSubscriber() !== null);
    }

    /** A source subscription must belong to a branch the actor may see. */
    public function sourceSubscriber(): ?Subscriber
    {
        if (! $this->filled('source_subscriber_id') || ! ctype_digit((string) $this->input('source_subscriber_id'))) {
            return null;
        }

        return Subscriber::query()->visibleTo($this->user())->with('profile')->find($this->input('source_subscriber_id'));
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * Identity numbers are unique per shared profile, while the profile can
     * have several subscriptions. Updates keep their existing profile's ID.
     *
     * Only a Super Admin may choose the branch — the controller forces it
     * to the actor's own branch for everyone else, so branch_id isn't
     * validated for them at all.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $rules = [
            'full_name' => ['required', 'string', 'max:255'],
            'subscription_name' => ['nullable', 'string', 'max:255'],
            'national_id' => ['required', 'string', 'regex:/^\d{9}$/', Rule::unique('subscriber_profiles', 'national_id')->ignore($this->route('subscriber')?->subscriber_profile_id)],
            'phone' => ['required', 'string', 'regex:/\A05[69][0-9]{7}\z/'],
            'subscription_phone' => ['nullable', 'string', 'regex:/\A05[69][0-9]{7}\z/'],
            'address' => ['nullable', 'string', 'max:1000'],
            'meter_box_id' => ['nullable', Rule::exists('meter_boxes', 'id')],
            'tariff_id' => ['required', Rule::exists('tariffs', 'id')],
            // Optional, and any customer segment, whatever the tariff.
            'tariff_segment_id' => ['nullable', Rule::exists('tariff_segments', 'id')],
            'status' => ['required', Rule::enum(SubscriberStatus::class)],
            'circuit_breaker_id' => ['nullable', Rule::exists('circuit_breakers', 'id')],
            'minimum_charge' => ['required', 'numeric', 'min:0'],
            // The meter's reading when the subscriber is connected: it may wait while they are not
            // active yet, but billing counts from it, so an active subscriber must have it.
            'initial_reading' => [Rule::requiredIf($this->input('status') === SubscriberStatus::Active->value), 'nullable', 'numeric', 'decimal:0,2', 'min:0', 'max:9999999999.99'],
            'subscription_fee' => ['nullable', 'numeric', 'min:0'],
            'subscription_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];

        // A subscriber who has been active is disconnected, never put back to waiting.
        if ($this->route('subscriber')?->activated_at !== null) {
            $rules['status'][] = Rule::notIn([SubscriberStatus::Suspended->value]);
        }

        if ($this->user()->isSuperAdmin()) {
            $rules['branch_id'] = ['required', Rule::exists('branches', 'id')];
        }

        $subscriber = $this->route('subscriber');

        if (! $subscriber) {
            $rules['source_subscriber_id'] = ['nullable', 'integer', Rule::exists('subscribers', 'id')];

            if ($this->filled('source_subscriber_id')) {
                foreach (SubscriberProfile::PERSONAL_FIELDS as $field) {
                    $rules[$field] = ['exclude'];
                }
            }
        }

        // A new subscriber can be charged the fee, and so can an existing one that has not been yet.
        if (! $subscriber || ! $subscriber->hasSubscriptionFeeCharge()) {
            $rules['charge_subscription_fee'] = ['sometimes', 'boolean'];

            if ($this->boolean('charge_subscription_fee')) {
                $rules['subscription_fee'] = ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:1000000'];
            }
        }

        return $rules;
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'subscription_phone.regex' => 'رقم الجوال يجب أن يتكون من 10 أرقام ويبدأ بـ 059 أو 056.',
            'status.not_in' => 'لا يمكن إعادة مشترك سبق تفعيله إلى «قيد الانتظار»؛ غيّر حالته إلى «مفصول».',
            'initial_reading.required' => 'أدخل القراءة السابقة قبل تفعيل المشترك؛ منها يبدأ حساب استهلاكه.',
            'national_id.unique' => 'رقم الهوية مسجل بالفعل. استخدم «إضافة اشتراك» من قائمة المشترك لإنشاء اشتراك آخر.',
            'charge_subscription_fee.boolean' => 'اختر تفعيل تحميل رسوم الاشتراك أو إلغاءه.',
            'subscription_fee.required' => 'أدخل مبلغ رسوم الاشتراك عند تفعيل تحميل الرسوم.',
            'subscription_fee.gt' => 'يجب أن تكون رسوم الاشتراك أكبر من صفر عند تحميلها.',
        ];
    }
}
