<x-app-layout>
    <x-slot name="header">
        <h2 class="font-semibold text-xl text-gray-800 leading-tight">
            {{ __('Edit User') }}
        </h2>
    </x-slot>

    <div class="py-12">
        <div class="max-w-2xl mx-auto sm:px-6 lg:px-8">
            <div class="bg-white p-6 shadow-sm sm:rounded-lg">
                <form method="POST" action="{{ route('users.update', $user) }}">
                    @csrf
                    @method('PUT')
                    @include('users._form', ['user' => $user, 'branches' => $branches, 'canChooseRole' => $canChooseRole])

                    <div class="mt-6 flex items-center gap-4">
                        <x-primary-button>{{ __('Save') }}</x-primary-button>
                        <a href="{{ route('users.index') }}" class="text-sm text-gray-600 underline">{{ __('Cancel') }}</a>
                    </div>
                </form>
            </div>
        </div>
    </div>
</x-app-layout>
