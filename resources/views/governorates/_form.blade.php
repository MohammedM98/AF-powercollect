<div>
    <x-input-label for="name" :value="__('Name')" />
    <x-text-input id="name" name="name" type="text" class="mt-1 block w-full" :value="old('name', $governorate['name'] ?? '')" required autofocus />
    <x-input-error :messages="$errors->get('name')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label :value="__('Areas')" />
    <p class="mt-1 text-sm text-gray-500">{{ __('Check every area that belongs to this governorate.') }}</p>

    @php
        $selectedAreaIds = old('area_ids', isset($governorate) ? $governorate['area_ids']->all() : []);
    @endphp

    @if ($areas->isEmpty())
        <p class="mt-2 text-sm text-gray-500">{{ __('No areas configured yet.') }}</p>
    @else
        <div class="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-md border border-gray-200 p-3">
            @foreach ($areas as $area)
                <label class="flex items-center gap-2 text-sm text-gray-700">
                    <input
                        type="checkbox"
                        name="area_ids[]"
                        value="{{ $area['id'] }}"
                        class="rounded border-gray-300 text-brand-600 shadow-sm focus:ring-brand-500"
                        @checked(in_array($area['id'], $selectedAreaIds))
                    >
                    {{ $area['name'] }}
                    @if ($area['governorateName'] && (! isset($governorate) || $area['governorateName'] !== $governorate['name']))
                        <span class="text-xs text-gray-400">({{ __('currently in :governorate', ['governorate' => $area['governorateName']]) }})</span>
                    @endif
                </label>
            @endforeach
        </div>
    @endif
    <x-input-error :messages="$errors->get('area_ids')" class="mt-2" />
</div>
