<?php

namespace App\Http\Requests;

use App\Enums\UserRole;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\Validator;

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
     * A Super Admin may reassign role/branch for any target except another
     * Super Admin. A Branch Admin may reassign a staff member's role among
     * the branch-level staff roles, but never their branch — branch_id
     * isn't validated for them at all.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $actor = $this->user();
        $target = $this->route('user');

        $rules = [
            'name' => ['required', 'string', 'max:255'],
            'user_type_id' => ['nullable', 'integer', Rule::exists('user_types', 'id')],
            'username' => ['required', 'string', 'max:255', 'regex:/^[\w.-]+$/', Rule::unique('users', 'username')->ignore($target->id)],
            'password' => ['nullable', 'confirmed', Password::defaults()],
            'is_active' => ['boolean'],
        ];

        if ($actor->isSuperAdmin() && ! $target->isSuperAdmin()) {
            $rules['role'] = ['sometimes', Rule::enum(UserRole::class)->only(UserRole::assignableBySuperAdmin())];
            $rules['branch_id'] = ['required', Rule::exists('branches', 'id')];
        } elseif ($actor->isBranchAdmin()) {
            $rules['role'] = ['sometimes', Rule::enum(UserRole::class)->only(UserRole::staffRoles())];
        }

        return $rules;
    }

    /**
     * Nobody stops their own account: whoever does so would be shut out
     * with no one left to turn it back on.
     *
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($this->has('is_active') && ! $this->boolean('is_active') && $this->route('user')->is($this->user())) {
                    $validator->errors()->add('is_active', 'لا يمكنك إيقاف حسابك بنفسك.');
                }
            },
        ];
    }
}
