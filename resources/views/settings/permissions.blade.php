<x-app-layout>
    <x-slot name="header">
        <h2 class="text-xl font-bold text-gray-900">
            {{ __('Permissions') }}
        </h2>
    </x-slot>

    @if (session('status') === 'permissions-updated')
        <div class="mb-4 text-sm font-medium text-green-600">{{ __('Permissions updated.') }}</div>
    @endif

    <p class="mb-4 text-sm text-gray-500">
        {{ __('Super Admin always has every permission implicitly. Grant individual permissions to specific users here, independent of their role.') }}
    </p>

    <form method="POST" action="{{ route('settings.permissions.update') }}">
        @csrf
        @method('PUT')

        <div class="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table class="w-full text-sm text-start">
                <thead class="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                        <th class="px-6 py-3">{{ __('User') }}</th>
                        <th class="px-6 py-3">{{ __('Role') }}</th>
                        <th class="px-6 py-3">{{ __('Branch') }}</th>
                        @foreach ($permissions as $permission)
                            <th class="px-6 py-3 text-center">{{ __($permission->label) }}</th>
                        @endforeach
                    </tr>
                </thead>
                <tbody class="divide-y">
                    @forelse ($users as $user)
                        <tr>
                            <td class="px-6 py-4">
                                <div class="font-medium text-gray-900">{{ $user->name }}</div>
                                <div class="text-gray-500"><span dir="ltr">{{ '@'.$user->username }}</span></div>
                            </td>
                            <td class="px-6 py-4 text-gray-600">{{ __($user->role->label()) }}</td>
                            <td class="px-6 py-4 text-gray-600">{{ $user->branch?->name ?? '—' }}</td>
                            @foreach ($permissions as $permission)
                                <td class="px-6 py-4 text-center">
                                    <input type="checkbox"
                                           name="permissions[{{ $user->id }}][]"
                                           value="{{ $permission->id }}"
                                           class="rounded border-gray-300 text-brand-600 shadow-sm focus:ring-brand-500"
                                           @checked($user->permissions->contains('id', $permission->id))>
                                </td>
                            @endforeach
                        </tr>
                    @empty
                        <tr>
                            <td class="px-6 py-4 text-gray-500" colspan="{{ 3 + $permissions->count() }}">
                                {{ __('No users to manage yet.') }}
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>

        <div class="mt-6">
            <x-primary-button>{{ __('Save') }}</x-primary-button>
        </div>
    </form>
</x-app-layout>
