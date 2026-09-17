<?php

namespace App\Http\Requests;

use App\Enums\UserRole;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class UpdateUserRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('user'));
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * Role/branch reassignment is only offered to Super Admins, and never
     * for a target who is already a Super Admin.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $actor = $this->user();
        $target = $this->route('user');

        $rules = [
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'max:255', 'regex:/^[\w.-]+$/', Rule::unique('users', 'username')->ignore($target->id)],
            'password' => ['nullable', 'confirmed', Password::defaults()],
            'is_active' => ['boolean'],
        ];

        if ($actor->isSuperAdmin() && ! $target->isSuperAdmin()) {
            $rules['role'] = ['required', Rule::in([UserRole::BranchAdmin->value, UserRole::Collector->value])];
            $rules['branch_id'] = ['required', Rule::exists('branches', 'id')];
        }

        return $rules;
    }
}
