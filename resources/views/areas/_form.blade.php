<div>
    <x-input-label for="name" :value="__('Name')" />
    <x-text-input id="name" name="name" type="text" class="mt-1 block w-full" :value="old('name', $area['name'] ?? '')" required autofocus />
    <x-input-error :messages="$errors->get('name')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="governorate_id" :value="__('Governorate')" />
    @if ($governorates->isEmpty())
        <p class="mt-1 text-sm text-gray-500">{{ __('No governorates configured yet.') }}</p>
    @else
        <select id="governorate_id" name="governorate_id" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
            <option value="">{{ __('— No Governorate —') }}</option>
            @foreach ($governorates as $governorate)
                <option value="{{ $governorate->id }}" @selected((string) old('governorate_id', $area['governorate_id'] ?? '') === (string) $governorate->id)>{{ $governorate->name }}</option>
            @endforeach
        </select>
    @endif
    <x-input-error :messages="$errors->get('governorate_id')" class="mt-2" />
</div>
