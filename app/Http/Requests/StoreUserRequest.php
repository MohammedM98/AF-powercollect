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
            'username' => ['required', 'string', 'max:255', 'regex:/^[\w.-]+$/', Rule::unique('users', 'username')],
            'password' => ['required', 'confirmed', Password::defaults()],
        ];

        if ($actor->isSuperAdmin()) {
            $assignable = [UserRole::BranchAdmin, ...UserRole::staffRoles()];
            $rules['role'] = ['required', Rule::in(array_column($assignable, 'value'))];
            $rules['branch_id'] = ['required', Rule::exists('branches', 'id')];
        } else {
            $rules['role'] = ['required', Rule::in(array_column(UserRole::staffRoles(), 'value'))];
        }

        return $rules;
    }
}
