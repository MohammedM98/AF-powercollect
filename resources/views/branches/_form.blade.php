<div>
    <x-input-label for="name" value="Name" />
    <x-text-input id="name" name="name" type="text" class="mt-1 block w-full" :value="old('name', $branch->name ?? '')" required autofocus />
    <x-input-error :messages="$errors->get('name')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="location" value="Location" />
    <x-text-input id="location" name="location" type="text" class="mt-1 block w-full" :value="old('location', $branch->location ?? '')" />
    <x-input-error :messages="$errors->get('location')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="phone" value="Phone" />
    <x-text-input id="phone" name="phone" type="text" class="mt-1 block w-full" :value="old('phone', $branch->phone ?? '')" />
    <x-input-error :messages="$errors->get('phone')" class="mt-2" />
</div>

<div class="mt-4 flex items-center">
    <input type="hidden" name="is_active" value="0">
    <input type="checkbox" id="is_active" name="is_active" value="1" class="rounded border-gray-300 text-indigo-600 shadow-sm" @checked(old('is_active', $branch->is_active ?? true))>
    <x-input-label for="is_active" value="Active" class="ms-2 !mb-0" />
</div>
