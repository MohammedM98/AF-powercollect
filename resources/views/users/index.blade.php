<x-app-layout>
    <x-slot name="header">
        <h2 class="text-xl font-bold text-gray-900">
            {{ __('Users') }}
        </h2>
    </x-slot>

    <x-slot name="actions">
        <a href="{{ route('users.create') }}" class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            {{ __('New User') }}
        </a>
    </x-slot>

    @if (session('status') === 'user-created')
        <div class="mb-4 text-sm font-medium text-green-600">{{ __('User created.') }}</div>
    @elseif (session('status') === 'user-updated')
        <div class="mb-4 text-sm font-medium text-green-600">{{ __('User updated.') }}</div>
    @endif

    <div class="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table class="w-full text-sm text-start">
            <thead class="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                    <th class="px-6 py-3">{{ __('Name') }}</th>
                    <th class="px-6 py-3">{{ __('Username') }}</th>
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
                        <td class="px-6 py-4 text-gray-600"><span dir="ltr">{{ $user->username }}</span></td>
                        <td class="px-6 py-4 text-gray-600">{{ __($user->role->label()) }}</td>
                        <td class="px-6 py-4 text-gray-600">{{ $user->branch?->name ?? '—' }}</td>
                        <td class="px-6 py-4">
                            @if ($user->is_active)
                                <span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{{ __('Active') }}</span>
                            @else
                                <span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">{{ __('Stopped') }}</span>
                            @endif
                        </td>
                        <td class="px-6 py-4 text-end">
                            @can('update', $user)
                                <a href="{{ route('users.edit', $user) }}" class="font-medium text-brand-600 hover:underline">{{ __('Edit') }}</a>
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
</x-app-layout>
