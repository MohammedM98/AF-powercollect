<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            {{ __('Permissions') }}
        </h2>
    </x-slot>

    <div class="py-12">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8">
            @if (session('status') === 'permissions-updated')
                <div class="mb-4 font-medium text-sm text-green-600">{{ __('Permissions updated.') }}</div>
            @endif

            <p class="mb-4 text-sm text-gray-500">
                {{ __('Super Admin always has every permission implicitly. Grant individual permissions to specific users here, independent of their role.') }}
            </p>

            <form method="POST" action="{{ route('settings.permissions.update') }}">
                @csrf
                @method('PUT')

                <div class="bg-white shadow-sm sm:rounded-lg overflow-hidden">
                    <table class="w-full text-sm text-start">
                        <thead class="bg-gray-50 text-gray-500 uppercase text-xs">
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
                                                   class="rounded border-gray-300 text-indigo-600 shadow-sm"
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
        </div>
    </div>
</x-app-layout>
