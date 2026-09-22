<x-app-layout>
    <x-slot name="header">
        <h2 class="text-xl font-bold text-gray-900">
            {{ __('Tariffs') }}
        </h2>
    </x-slot>

    <x-slot name="actions">
        <a href="{{ route('tariffs.create') }}" class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            {{ __('New Tariff') }}
        </a>
    </x-slot>

    @if (session('status') === 'tariff-created')
        <div class="mb-4 text-sm font-medium text-green-600">{{ __('Tariff created.') }}</div>
    @elseif (session('status') === 'tariff-updated')
        <div class="mb-4 text-sm font-medium text-green-600">{{ __('Tariff updated.') }}</div>
    @endif

    <div class="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table class="w-full text-sm text-start">
            <thead class="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                    <th class="px-6 py-3">{{ __('Category') }}</th>
                    <th class="px-6 py-3">{{ __('Rate') }}</th>
                    <th class="px-6 py-3"></th>
                </tr>
            </thead>
            <tbody class="divide-y">
                @forelse ($tariffs as $tariff)
                    <tr>
                        <td class="px-6 py-4 font-medium text-gray-900">{{ __($tariff->category->label()) }}</td>
                        <td class="px-6 py-4 text-gray-600" dir="ltr">{{ number_format($tariff->rate, 2) }} شيكل</td>
                        <td class="px-6 py-4 text-end">
                            <a href="{{ route('tariffs.edit', $tariff) }}" class="font-medium text-brand-600 hover:underline">{{ __('Edit') }}</a>
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td class="px-6 py-4 text-gray-500" colspan="3">{{ __('No tariffs configured yet.') }}</td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>

    <div class="mt-4">
        {{ $tariffs->links() }}
    </div>
</x-app-layout>
