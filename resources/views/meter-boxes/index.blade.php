<x-app-layout>
    <x-slot name="header">
        <h2 class="text-xl font-bold text-gray-900">
            {{ __('Meter Boxes') }}
        </h2>
    </x-slot>

    <x-slot name="actions">
        <a href="{{ route('meter-boxes.create') }}" class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            {{ __('New Meter Box') }}
        </a>
    </x-slot>

    @if (session('status') === 'meter-box-created')
        <div class="mb-4 text-sm font-medium text-green-600">{{ __('Meter box created.') }}</div>
    @elseif (session('status') === 'meter-box-updated')
        <div class="mb-4 text-sm font-medium text-green-600">{{ __('Meter box updated.') }}</div>
    @endif

    <div class="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table class="w-full text-sm text-start">
            <thead class="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                    <th class="px-6 py-3">{{ __('Name') }}</th>
                    <th class="px-6 py-3">{{ __('Box Number') }}</th>
                    <th class="px-6 py-3">{{ __('Location') }}</th>
                    <th class="px-6 py-3">{{ __('Branch') }}</th>
                    <th class="px-6 py-3">{{ __('Governorate') }} / {{ __('Area') }}</th>
                    <th class="px-6 py-3"></th>
                </tr>
            </thead>
            <tbody class="divide-y">
                @forelse ($meterBoxes as $meterBox)
                    <tr>
                        <td class="px-6 py-4 font-medium text-gray-900">{{ $meterBox->name }}</td>
                        <td class="px-6 py-4 text-gray-600" dir="ltr">{{ $meterBox->box_number }}</td>
                        <td class="px-6 py-4 text-gray-600">{{ $meterBox->location }}</td>
                        <td class="px-6 py-4 text-gray-600">{{ $meterBox->branch->name }}</td>
                        <td class="px-6 py-4 text-gray-600">{{ collect([$meterBox->branch->governorate?->name, $meterBox->branch->area?->name])->filter()->implode(' / ') ?: '—' }}</td>
                        <td class="px-6 py-4 text-end">
                            <a href="{{ route('meter-boxes.edit', $meterBox) }}" class="font-medium text-brand-600 hover:underline">{{ __('Edit') }}</a>
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td class="px-6 py-4 text-gray-500" colspan="6">{{ __('No meter boxes exist yet.') }}</td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>

    <div class="mt-4">
        {{ $meterBoxes->links() }}
    </div>
</x-app-layout>
