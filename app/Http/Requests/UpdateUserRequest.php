<?php

namespace App\Http\Requests;

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
        return $this->user()->can('update', $this->route('user'))
            && (! $this->filled('password') || $this->user()->can('updatePassword', $this->route('user')));
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * Editing a job title or account details never changes permission grants.
     * Only a Super Admin may change an employee's administrative branch.
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
            'role' => ['prohibited'],
        ];

        if ($actor->isSuperAdmin() && ! $target->isSuperAdmin()) {
            $rules['branch_id'] = ['required', Rule::exists('branches', 'id')];
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
