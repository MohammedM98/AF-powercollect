<div>
    <x-input-label for="name" value="Name" />
    <x-text-input id="name" name="name" type="text" class="mt-1 block w-full" :value="old('name', $user->name ?? '')" required autofocus />
    <x-input-error :messages="$errors->get('name')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="username" value="Username" />
    <x-text-input id="username" name="username" type="text" class="mt-1 block w-full" dir="ltr" :value="old('username', $user->username ?? '')" required />
    <x-input-error :messages="$errors->get('username')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="email" value="Email" />
    <x-text-input id="email" name="email" type="email" class="mt-1 block w-full" dir="ltr" :value="old('email', $user->email ?? '')" required />
    <x-input-error :messages="$errors->get('email')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="password" :value="isset($user) ? __('New Password (leave blank to keep current)') : __('Password')" />
    @if (isset($user))
        <x-text-input id="password" name="password" type="password" class="mt-1 block w-full" />
    @else
        <x-text-input id="password" name="password" type="password" class="mt-1 block w-full" required />
    @endif
    <x-input-error :messages="$errors->get('password')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="password_confirmation" value="Confirm Password" />
    <x-text-input id="password_confirmation" name="password_confirmation" type="password" class="mt-1 block w-full" />
</div>

@if ($branches->isNotEmpty() && (! isset($user) || ! $user->isSuperAdmin()))
    <div class="mt-4">
        <x-input-label for="role" value="Role" />
        <select id="role" name="role" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
            @foreach (\App\Enums\UserRole::cases() as $role)
                @continue($role === \App\Enums\UserRole::SuperAdmin)
                <option value="{{ $role->value }}" @selected(old('role', $user->role->value ?? '') === $role->value)>{{ $role->label() }}</option>
            @endforeach
        </select>
        <x-input-error :messages="$errors->get('role')" class="mt-2" />
    </div>

    <div class="mt-4">
        <x-input-label for="branch_id" value="Branch" />
        <select id="branch_id" name="branch_id" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
            <option value="">{{ __('— Select Branch —') }}</option>
            @foreach ($branches as $branch)
                <option value="{{ $branch->id }}" @selected((string) old('branch_id', $user->branch_id ?? '') === (string) $branch->id)>{{ $branch->name }}</option>
            @endforeach
        </select>
        <x-input-error :messages="$errors->get('branch_id')" class="mt-2" />
    </div>
@else
    <p class="mt-4 text-sm text-gray-500">{{ __('This user will be created as a Collector in your branch.') }}</p>
@endif

<div class="mt-4 flex items-center">
    <input type="hidden" name="is_active" value="0">
    <input type="checkbox" id="is_active" name="is_active" value="1" class="rounded border-gray-300 text-indigo-600 shadow-sm" @checked(old('is_active', $user->is_active ?? true))>
    <x-input-label for="is_active" value="Active" class="ms-2 !mb-0" />
</div>
