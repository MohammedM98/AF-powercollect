<x-app-layout>
    <x-slot name="header">
        <h2 class="text-xl font-bold text-gray-900">
            {{ __('Create Subscriber') }}
        </h2>
    </x-slot>

    <div class="max-w-6xl">
        <div class="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <form method="POST" action="{{ route('subscribers.store') }}">
                @csrf
                @include('subscribers._form', ['subscriber' => null, 'branches' => $branches, 'meterBoxes' => $meterBoxes, 'tariffs' => $tariffs, 'areas' => $areas, 'canChooseBranch' => $canChooseBranch])

                <div class="mt-6 flex items-center gap-4">
                    <x-primary-button>{{ __('Save') }}</x-primary-button>
                    <a href="{{ route('subscribers.index') }}" class="text-sm text-gray-600 underline">{{ __('Cancel') }}</a>
                </div>
            </form>
        </div>
    </div>
</x-app-layout>
