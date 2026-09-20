<x-app-layout>
    <x-slot name="header">
        <h2 class="text-xl font-bold text-gray-900">
            {{ __('Create Governorate') }}
        </h2>
    </x-slot>

    <div class="max-w-2xl">
        <div class="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <form method="POST" action="{{ route('governorates.store') }}">
                @csrf
                @include('governorates._form', ['governorate' => null, 'areas' => $areas])

                <div class="mt-6 flex items-center gap-4">
                    <x-primary-button>{{ __('Save') }}</x-primary-button>
                    <a href="{{ route('governorates.index') }}" class="text-sm text-gray-600 underline">{{ __('Cancel') }}</a>
                </div>
            </form>
        </div>
    </div>
</x-app-layout>
