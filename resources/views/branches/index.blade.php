<x-app-layout>
    <x-slot name="header">
        <div class="flex items-center justify-between">
            <h2 class="font-semibold text-xl text-gray-800 leading-tight">
                {{ __('Branches') }}
            </h2>
            <a href="{{ route('branches.create') }}" class="text-sm text-white bg-gray-800 hover:bg-gray-700 rounded-md px-4 py-2">
                {{ __('New Branch') }}
            </a>
        </div>
    </x-slot>

    <div class="py-12">
        <div class="max-w-7xl mx-auto sm:px-6 lg:px-8">
            @if (session('status') === 'branch-created')
                <div class="mb-4 font-medium text-sm text-green-600">{{ __('Branch created.') }}</div>
            @elseif (session('status') === 'branch-updated')
                <div class="mb-4 font-medium text-sm text-green-600">{{ __('Branch updated.') }}</div>
            @endif

            <div class="bg-white shadow-sm sm:rounded-lg overflow-hidden">
                <table class="w-full text-sm text-left">
                    <thead class="bg-gray-50 text-gray-500 uppercase text-xs">
                        <tr>
                            <th class="px-6 py-3">{{ __('Name') }}</th>
                            <th class="px-6 py-3">{{ __('Location') }}</th>
                            <th class="px-6 py-3">{{ __('Phone') }}</th>
                            <th class="px-6 py-3">{{ __('Status') }}</th>
                            <th class="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
                        @foreach ($branches as $branch)
                            <tr>
                                <td class="px-6 py-4 font-medium text-gray-900">{{ $branch->name }}</td>
                                <td class="px-6 py-4 text-gray-600">{{ $branch->location }}</td>
                                <td class="px-6 py-4 text-gray-600">{{ $branch->phone }}</td>
                                <td class="px-6 py-4">
                                    @if ($branch->is_active)
                                        <span class="text-green-700">{{ __('Active') }}</span>
                                    @else
                                        <span class="text-gray-400">{{ __('Stopped') }}</span>
                                    @endif
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <a href="{{ route('branches.edit', $branch) }}" class="text-indigo-600 hover:underline">{{ __('Edit') }}</a>
                                </td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>

            <div class="mt-4">
                {{ $branches->links() }}
            </div>
        </div>
    </div>
</x-app-layout>
