<?php

namespace App\Http\Requests;

use App\Enums\CashBoxType;
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
        if (in_array($action, ['receive', 'receive-type'], true)) {
            $rules += ['cash_counted' => ['sometimes', 'boolean']];
        }
        if ($action === 'receive-type') {
            $rules += ['type' => ['required', Rule::enum(CashBoxType::class)], 'box_ids' => ['required', 'array', 'min:1'], 'box_ids.*' => ['integer', 'distinct']];
        }
        if ($action === 'electronic') {
            $rules += ['status' => ['required', 'in:confirmed,missing,rejected']];
        }
        if ($action === 'submit') {
            $rules += ['acknowledged' => ['accepted'], 'notes' => ['nullable', 'string', 'max:3000']];
        }
        if ($action === 'settings') {
            $staff = Rule::exists('users', 'id')->where('branch_id', $this->integer('branch_id'))->where('is_active', true);
            $rules += ['settings' => ['required', 'array:week_starts_on,cutoff_time'], 'settings.week_starts_on' => ['required', 'integer', 'between:0,6'], 'settings.cutoff_time' => ['required', 'date_format:H:i'], 'receivers' => ['present', 'array'], 'receivers.*' => ['integer', $staff], 'approvers' => ['present', 'array'], 'approvers.*' => ['integer', $staff]];
        }
        if ($action === 'repay') {
            $rules += ['amount' => ['required', 'numeric', 'min:0.01', 'max:9999999999']];
        }
        if ($action === 'reply') {
            $rules += ['decisions' => ['sometimes', 'array:ILS,USD,JOD'], 'decisions.*' => ['in:accepted,debt']];
            $rules += ['kind' => ['required', 'in:adjustment,document,clarification,collector'], 'body' => ['required', 'string', 'max:3000'], 'document' => ['required_if:kind,document', 'nullable', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:5120'], 'book' => ['required_if:kind,adjustment', 'in:cash,bank'], 'currency' => ['required_if:kind,adjustment', 'in:ILS,USD,JOD'], 'amount' => ['required_if:kind,adjustment', 'numeric', 'not_in:0', 'between:-9999999999,9999999999']];
        }

        return $rules;
    }
}
