<div>
    <x-input-label for="name" :value="__('Name')" />
    <x-text-input id="name" name="name" type="text" class="mt-1 block w-full" :value="old('name', $branch->name ?? '')" required autofocus />
    <x-input-error :messages="$errors->get('name')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="location" :value="__('Location')" />
    <x-text-input id="location" name="location" type="text" class="mt-1 block w-full" :value="old('location', $branch->location ?? '')" />
    <x-input-error :messages="$errors->get('location')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="phone" :value="__('Phone')" />
    <x-text-input id="phone" name="phone" type="text" class="mt-1 block w-full" dir="ltr" :value="old('phone', $branch->phone ?? '')" />
    <x-input-error :messages="$errors->get('phone')" class="mt-2" />
</div>

<div class="mt-4 flex items-center">
    <input type="hidden" name="is_active" value="0">
    <input type="checkbox" id="is_active" name="is_active" value="1" class="rounded border-gray-300 text-brand-600 shadow-sm" @checked(old('is_active', $branch->is_active ?? true))>
    <x-input-label for="is_active" :value="__('Active')" class="ms-2 !mb-0" />
</div>
