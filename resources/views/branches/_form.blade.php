<div>
    <x-input-label for="name" :value="__('Name')" />
    <x-text-input id="name" name="name" type="text" class="mt-1 block w-full" :value="old('name', $branch->name ?? '')" required autofocus />
    <x-input-error :messages="$errors->get('name')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="phone" :value="__('Phone')" />
    <x-text-input id="phone" name="phone" type="text" class="mt-1 block w-full" dir="ltr" :value="old('phone', $branch->phone ?? '')" />
    <x-input-error :messages="$errors->get('phone')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="governorate_id" :value="__('Governorate')" />
    @if ($governorates->isEmpty())
        <p class="mt-1 text-sm text-gray-500">{{ __('No governorates configured yet.') }}</p>
    @else
        <select id="governorate_id" name="governorate_id" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
            <option value="">{{ __('— No Governorate —') }}</option>
            @foreach ($governorates as $governorate)
                <option value="{{ $governorate->id }}" @selected((string) old('governorate_id', $branch->governorate_id ?? '') === (string) $governorate->id)>{{ $governorate->name }}</option>
            @endforeach
        </select>
    @endif
    <x-input-error :messages="$errors->get('governorate_id')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="area_id" :value="__('Area')" />
    @if ($areas->isEmpty())
        <p class="mt-1 text-sm text-gray-500">{{ __('No areas configured yet.') }}</p>
    @else
        <select id="area_id" name="area_id" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
            <option value="">{{ __('— No Area —') }}</option>
            @foreach ($areas as $area)
                <option value="{{ $area->id }}" @selected((string) old('area_id', $branch->area_id ?? '') === (string) $area->id)>{{ $area->name }}@if ($area->governorate) — {{ $area->governorate->name }} @endif</option>
            @endforeach
        </select>
    @endif
    <x-input-error :messages="$errors->get('area_id')" class="mt-2" />
</div>

<div class="mt-4 flex items-center">
    <input type="hidden" name="is_active" value="0">
    <input type="checkbox" id="is_active" name="is_active" value="1" class="rounded border-gray-300 text-brand-600 shadow-sm" @checked(old('is_active', $branch->is_active ?? true))>
    <x-input-label for="is_active" :value="__('Active')" class="ms-2 !mb-0" />
</div>
