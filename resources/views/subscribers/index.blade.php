<x-app-layout>
    <x-slot name="header">
        <h2 class="text-xl font-bold text-gray-900">
            {{ __('Subscribers') }}
        </h2>
    </x-slot>

    <x-slot name="actions">
        @can('create', App\Models\Subscriber::class)
            <a href="{{ route('subscribers.create') }}" class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                {{ __('New Subscriber') }}
            </a>
        @endcan
    </x-slot>

    @if (session('status') === 'subscriber-created')
        <div class="mb-4 text-sm font-medium text-green-600">{{ __('Subscriber created.') }}</div>
    @elseif (session('status') === 'subscriber-updated')
        <div class="mb-4 text-sm font-medium text-green-600">{{ __('Subscriber updated.') }}</div>
    @endif

    <div class="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table class="w-full text-sm text-start">
            <thead class="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                    <th class="px-6 py-3">{{ __('Full Name') }}</th>
                    <th class="px-6 py-3">{{ __('Meter Number') }}</th>
                    <th class="px-6 py-3">{{ __('Meter Box') }}</th>
                    <th class="px-6 py-3">{{ __('Tariff') }}</th>
                    <th class="px-6 py-3">{{ __('Branch') }}</th>
                    <th class="px-6 py-3">{{ __('Status') }}</th>
                    <th class="px-6 py-3"></th>
                </tr>
            </thead>
            <tbody class="divide-y">
                @forelse ($subscribers as $subscriber)
                    <tr>
                        <td class="px-6 py-4 font-medium text-gray-900">{{ $subscriber->full_name }}</td>
                        <td class="px-6 py-4 text-gray-600"><span dir="ltr">{{ $subscriber->meter_number }}</span></td>
                        <td class="px-6 py-4 text-gray-600">
                            <span dir="ltr">{{ $subscriber->meterBox?->box_number ?? '—' }}</span>
                        </td>
                        <td class="px-6 py-4 text-gray-600">{{ __($subscriber->tariff->category->label()) }}</td>
                        <td class="px-6 py-4 text-gray-600">{{ $subscriber->branch->name }}</td>
                        <td class="px-6 py-4">
                            @if ($subscriber->status === \App\Enums\SubscriberStatus::Active)
                                <span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{{ __($subscriber->status->label()) }}</span>
                            @elseif ($subscriber->status === \App\Enums\SubscriberStatus::Suspended)
                                <span class="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{{ __($subscriber->status->label()) }}</span>
                            @else
                                <span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">{{ __($subscriber->status->label()) }}</span>
                            @endif
                        </td>
                        <td class="px-6 py-4 text-end">
                            @can('update', $subscriber)
                                <a href="{{ route('subscribers.edit', $subscriber) }}" class="font-medium text-brand-600 hover:underline">{{ __('Edit') }}</a>
                            @endcan
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td class="px-6 py-4 text-gray-500" colspan="7">
                            {{ __('No subscribers registered yet.') }}
                        </td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>

    <div class="mt-4">
        {{ $subscribers->links() }}
    </div>
</x-app-layout>
