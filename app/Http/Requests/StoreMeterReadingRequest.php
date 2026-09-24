<?php

namespace App\Http\Requests;

use App\Enums\SubscriberStatus;
use App\Models\MeterReading;
use App\Models\Subscriber;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreMeterReadingRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('create', MeterReading::class);
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * Only active subscribers in the actor's own branch (any branch for a
     * Super Admin) can have readings recorded.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $actor = $this->user();

        return [
            'subscriber_id' => [
                'required',
                Rule::exists('subscribers', 'id')
                    ->where('status', SubscriberStatus::Active->value)
                    ->when(! $actor->isSuperAdmin(), fn ($rule) => $rule->where('branch_id', $actor->branch_id)),
            ],
            'week_start' => ['required', 'date', 'before_or_equal:today'],
            'current_reading' => ['required', 'integer', 'min:0', 'max:4294967295'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    /**
     * Readings must be entered week after week: one per subscriber per
     * week, never before a week already recorded, and never lower than
     * the reading the week starts from.
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

                $subscriber = Subscriber::findOrFail($this->integer('subscriber_id'));
                $weekStart = $this->weekStart();
                $latestWeekStart = $subscriber->meterReadings()->max('week_start');

                if ($latestWeekStart !== null && Carbon::parse($latestWeekStart)->gte($weekStart)) {
                    $validator->errors()->add('week_start', Carbon::parse($latestWeekStart)->equalTo($weekStart)
                        ? 'تم تسجيل قراءة لهذا المشترك في هذا الأسبوع مسبقًا.'
                        : 'يوجد قراءة لأسبوع لاحق لهذا المشترك، لا يمكن إدخال أسبوع سابق.');

                    return;
                }

                $previousReading = $subscriber->previousReadingBefore($weekStart);

                if ($this->integer('current_reading') < $previousReading) {
                    $validator->errors()->add('current_reading', "القراءة الحالية لا يمكن أن تكون أقل من القراءة السابقة ({$previousReading}).");
                }
            },
        ];
    }

    /**
     * The Friday that starts the week the submitted date falls in.
     */
    public function weekStart(): Carbon
    {
        return MeterReading::weekStartFor(Carbon::parse($this->input('week_start')));
    }
}
