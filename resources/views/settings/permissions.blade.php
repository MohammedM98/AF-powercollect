<x-app-layout>
    <x-slot name="header">
        <h2 class="text-xl font-bold text-gray-900">
            {{ __('Permissions') }}
        </h2>
    </x-slot>

    @php
        $actionLabels = [
            'view' => __('View'),
            'create' => __('Add'),
            'update' => __('Edit'),
            'record' => __('Record'),
            'confirm' => __('Confirm'),
        ];
    @endphp

    @if (session('status') === 'permissions-updated')
        <div class="mb-4 text-sm font-medium text-green-600">{{ __('Permissions updated.') }}</div>
    @endif

    <p class="mb-4 text-sm text-gray-500">
        {{ __('Super Admin always has every permission implicitly. Grant each user either view-only or full management (add/edit) per table here, independent of their role.') }}
    </p>

    <form method="GET" action="{{ route('settings.permissions.edit') }}" class="mb-4">
        <input type="text" name="search" value="{{ $filters['search'] }}" placeholder="{{ __('Search by name or username...') }}"
               class="block w-full max-w-xs rounded-lg border-gray-300 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500">
    </form>

    <form method="POST" action="{{ route('settings.permissions.update') }}">
        @csrf
        @method('PUT')

        <div class="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
            <table class="w-full text-sm text-start">
                <thead class="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                        <th class="whitespace-nowrap px-6 py-3" rowspan="2">{{ __('User') }}</th>
                        <th class="whitespace-nowrap px-6 py-3" rowspan="2">{{ __('Role') }}</th>
                        <th class="whitespace-nowrap px-6 py-3" rowspan="2">{{ __('Branch') }}</th>
                        @foreach ($permissionGroups as $group)
                            <th class="whitespace-nowrap border-s border-gray-100 px-4 py-2 text-center" colspan="{{ count($group['actions']) }}">{{ $group['label'] }}</th>
                        @endforeach
                    </tr>
                    <tr>
                        @foreach ($permissionGroups as $group)
                            @foreach ($group['actions'] as $entry)
                                <th class="whitespace-nowrap border-s border-gray-100 px-4 py-2 text-center font-medium">{{ $actionLabels[$entry['action']] ?? $entry['action'] }}</th>
                            @endforeach
                        @endforeach
                    </tr>
                </thead>
                <tbody class="divide-y">
                    @forelse ($users as $user)
                        <tr>
                            <td class="whitespace-nowrap px-6 py-4">
                                <div class="font-medium text-gray-900">{{ $user['name'] }}</div>
                                <div class="text-gray-500"><span dir="ltr">{{ '@'.$user['username'] }}</span></div>
                            </td>
                            <td class="whitespace-nowrap px-6 py-4 text-gray-600">{{ $user['roleLabel'] }}</td>
                            <td class="whitespace-nowrap px-6 py-4 text-gray-600">{{ $user['branchName'] ?? '—' }}</td>
                            @foreach ($permissionGroups as $group)
                                @foreach ($group['actions'] as $entry)
                                    <td class="border-s border-gray-100 px-4 py-4 text-center">
                                        @if ($entry['permission'])
                                            <input type="checkbox"
                                                   name="permissions[{{ $user['id'] }}][]"
                                                   value="{{ $entry['permission']['id'] }}"
                                                   class="rounded border-gray-300 text-brand-600 shadow-sm focus:ring-brand-500"
                                                   @checked(in_array($entry['permission']['id'], $user['permissionIds']))>
                                        @else
                                            <span class="text-gray-300">—</span>
                                        @endif
                                    </td>
                                @endforeach
                            @endforeach
                        </tr>
                    @empty
                        <tr>
                            <td class="px-6 py-4 text-gray-500" colspan="{{ 3 + collect($permissionGroups)->sum(fn ($group) => count($group['actions'])) }}">
                                {{ __('No users to manage yet.') }}
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>

        <div class="mt-4">
            {{ $users->appends($filters)->links() }}
        </div>

        <p class="mt-2 text-xs text-gray-500">
            {{ __('Saving only applies to the users currently listed above — search or page through to manage others.') }}
        </p>

        <div class="mt-6">
            <x-primary-button>{{ __('Save') }}</x-primary-button>
        </div>
    </form>
</x-app-layout>
