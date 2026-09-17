<x-app-layout>
    <x-slot name="header">
        <div class="flex items-center justify-between">
            <h2 class="font-semibold text-xl text-gray-800 leading-tight">
                {{ __('Users') }}
            </h2>
            <a href="{{ route('users.create') }}" class="text-sm text-white bg-gray-800 hover:bg-gray-700 rounded-md px-4 py-2">
                {{ __('New User') }}
            </a>
        </div>
    </x-slot>

    <div class="py-12">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8">
            @if (session('status') === 'user-created')
                <div class="mb-4 font-medium text-sm text-green-600">{{ __('User created.') }}</div>
            @elseif (session('status') === 'user-updated')
                <div class="mb-4 font-medium text-sm text-green-600">{{ __('User updated.') }}</div>
            @endif

            <div class="bg-white shadow-sm sm:rounded-lg overflow-hidden">
                <table class="w-full text-sm text-left">
                    <thead class="bg-gray-50 text-gray-500 uppercase text-xs">
                        <tr>
                            <th class="px-6 py-3">{{ __('Name') }}</th>
                            <th class="px-6 py-3">{{ __('Email') }}</th>
                            <th class="px-6 py-3">{{ __('Role') }}</th>
                            <th class="px-6 py-3">{{ __('Branch') }}</th>
                            <th class="px-6 py-3">{{ __('Status') }}</th>
                            <th class="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        @foreach ($users as $user)
                            <tr>
                                <td class="px-6 py-4 font-medium text-gray-900">{{ $user->name }}</td>
                                <td class="px-6 py-4 text-gray-600">{{ $user->email }}</td>
                                <td class="px-6 py-4 text-gray-600">{{ $user->role->label() }}</td>
                                <td class="px-6 py-4 text-gray-600">{{ $user->branch?->name ?? '—' }}</td>
                                <td class="px-6 py-4">
                                    @if ($user->is_active)
                                        <span class="text-green-700">{{ __('Active') }}</span>
                                    @else
                                        <span class="text-gray-400">{{ __('Stopped') }}</span>
                                    @endif
                                </td>
                                <td class="px-6 py-4 text-right">
                                    @can('update', $user)
                                        <a href="{{ route('users.edit', $user) }}" class="text-indigo-600 hover:underline">{{ __('Edit') }}</a>
                                    @endcan
                                </td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>

            <div class="mt-4">
                {{ $users->links() }}
            </div>
        </div>
    </div>
</x-app-layout>
