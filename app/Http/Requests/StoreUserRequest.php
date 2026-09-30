<?php

namespace App\Http\Requests;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class StoreUserRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return $this->user()->can('create', User::class);
    }

    /**
     * Regular accounts start with no preset permissions when no system role is supplied.
     */
    protected function prepareForValidation(): void
    {
        $this->mergeIfMissing(['role' => UserRole::Collector->value]);
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * A Super Admin may assign any role and any branch. Anyone else who can
     * reach this request — a Branch Admin, or a grantee of the "Add Users"
     * permission — may only assign the branch-level staff roles (Collector,
     * Data Entry, Financial Auditor); the controller forces branch_id to
     * their own branch server-side regardless of what's submitted, so
     * branch_id isn't validated for them at all.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $actor = $this->user();

        $rules = [
            'name' => ['required', 'string', 'max:255'],
            'user_type_id' => ['nullable', 'integer', Rule::exists('user_types', 'id')],
            'username' => ['required', 'string', 'max:255', 'regex:/^[\w.-]+$/', Rule::unique('users', 'username')],
            'password' => ['required', 'confirmed', Password::defaults()],
        ];

        if ($actor->isSuperAdmin()) {
            $rules['role'] = ['required', Rule::enum(UserRole::class)->only(UserRole::assignableBySuperAdmin())];
            $rules['branch_id'] = ['required', Rule::exists('branches', 'id')];
        } else {
            $rules['role'] = ['required', Rule::enum(UserRole::class)->only(UserRole::staffRoles())];
        }

        return $rules;
    }
}
