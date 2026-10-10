<?php

namespace App\Http\Requests;

use App\Models\Branch;
use App\Models\ClosingSetting;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateClosingScheduleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('manage', [ClosingSetting::class, $this->branch()]);
    }

    /**
     * The weekday that starts the week is the company's alone, so it is only
     * given with the company's schedule (no branch).
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'cutoff_time' => ['required', 'date_format:H:i'],
            'week_starts_on' => ['required_without:branch_id', 'nullable', 'integer', 'between:0,6'],
            'auto_open' => ['required', 'boolean'],
        ];
    }

    /**
     * The branch whose schedule this is, or null for the company's.
     */
    public function branch(): ?Branch
    {
        return $this->filled('branch_id') ? Branch::query()->find($this->integer('branch_id')) : null;
    }

    /**
     * The day closes at midnight, or at a time from noon on: an earlier
     * cut-off would cut the working day itself in two.
     *
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $cutoff = (string) $this->input('cutoff_time');

                if (! $validator->errors()->has('cutoff_time') && $cutoff !== '00:00' && $cutoff < '12:00') {
                    $validator->errors()->add('cutoff_time', 'اختر منتصف الليل (00:00) أو وقتًا من الظهر (12:00) فما بعد.');
                }
            },
        ];
    }
}
