<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class BoxAuditActionRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()?->is_active ?? false;
    }

    /**
     * What the auditor sends with an action on a box: the debt charged to
     * the branch and its reason when approving it, or the note and the
     * entries it is about when sending it back.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return match ($this->route('action')) {
            'approve' => ['debt' => ['nullable', 'numeric', 'min:0', 'max:9999999999'], 'debt_reason' => ['nullable', 'string', 'max:3000']],
            'return' => ['body' => ['required', 'string', 'max:3000'], 'entry_ids' => ['sometimes', 'array', 'max:500'], 'entry_ids.*' => ['integer', 'distinct']],
            default => [],
        };
    }
}
