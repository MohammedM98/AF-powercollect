<?php

namespace App\Http\Requests;

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
     * The job title grants no access. New employees start without permissions;
     * only a Super Admin may choose their administrative branch.
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
            'role' => ['prohibited'],
        ];

        if ($actor->isSuperAdmin()) {
            $rules['branch_id'] = ['required', Rule::exists('branches', 'id')];
        }

        return $rules;
    }
}
