<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class BranchClosingActionRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()?->is_active ?? false;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $action = $this->route('action');
        $rules = ['branch_id' => ['required', 'integer', 'exists:branches,id'], 'reason' => ['nullable', 'string', 'max:3000']];
        if (in_array($action, ['close', 'collector-count', 'head-count', 'safe-count'], true)) {
            $rules += ['counts' => ['required', 'array:ILS,USD,JOD'], 'counts.ILS' => ['required', 'numeric', 'min:0', 'max:9999999999'], 'counts.USD' => ['required', 'numeric', 'min:0', 'max:9999999999'], 'counts.JOD' => ['required', 'numeric', 'min:0', 'max:9999999999']];
        }
        if ($action === 'receive') {
            $rules += ['recounted' => ['required', 'boolean'], 'decisions' => ['present', 'array:ILS,USD,JOD'], 'decisions.*' => ['in:accepted,debt']];
        }
        if ($action === 'electronic') {
            $rules += ['status' => ['required', 'in:confirmed,missing']];
        }
        if ($action === 'submit') {
            $rules += ['acknowledged' => ['accepted'], 'notes' => ['nullable', 'string', 'max:3000']];
        }
        if ($action === 'settings') {
            $staff = Rule::exists('users', 'id')->where('branch_id', $this->integer('branch_id'))->where('is_active', true);
            $rules += ['settings' => ['required', 'array:frequency,arrangement,week_starts_on,cutoff_time'], 'settings.frequency' => ['required', 'in:weekly,daily'], 'settings.arrangement' => ['required', 'in:combined,separate'], 'settings.week_starts_on' => ['required', 'integer', 'between:0,6'], 'settings.cutoff_time' => ['required', 'date_format:H:i'], 'receivers' => ['present', 'array'], 'receivers.*' => ['integer', $staff], 'approvers' => ['present', 'array'], 'approvers.*' => ['integer', $staff]];
        }
        if (in_array($action, ['transfer', 'repay'], true)) {
            $rules += ['amount' => ['required', 'numeric', 'min:0.01', 'max:9999999999']];
        }
        if ($action === 'transfer') {
            $rules += ['currency' => ['required', 'in:ILS,USD,JOD'], 'method' => ['required', 'in:hand_delivery,bank_deposit'], 'proof' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'], 'recipient_id' => ['required', 'integer', Rule::exists('users', 'id')->where('is_active', true)]];
        }
        if ($action === 'reply') {
            $rules += ['decisions' => ['sometimes', 'array:ILS,USD,JOD'], 'decisions.*' => ['in:accepted,debt']];
            $rules += ['kind' => ['required', 'in:adjustment,document,clarification,collector'], 'body' => ['required', 'string', 'max:3000'], 'document' => ['required_if:kind,document', 'nullable', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:5120'], 'book' => ['required_if:kind,adjustment', 'in:cash,bank'], 'currency' => ['required_if:kind,adjustment', 'in:ILS,USD,JOD'], 'amount' => ['required_if:kind,adjustment', 'numeric', 'not_in:0', 'between:-9999999999,9999999999']];
        }

        return $rules;
    }
}
