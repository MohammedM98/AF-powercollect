<div>
    <x-input-label for="name" :value="__('Name')" />
    <x-text-input id="name" name="name" type="text" class="mt-1 block w-full" :value="old('name', $meterBox->name ?? '')" required autofocus />
    <x-input-error :messages="$errors->get('name')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="box_number" :value="__('Box Number')" />
    <x-text-input id="box_number" name="box_number" type="text" class="mt-1 block w-full" dir="ltr" :value="old('box_number', $meterBox->box_number ?? '')" required />
    <x-input-error :messages="$errors->get('box_number')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="location" :value="__('Location')" />
    <x-text-input id="location" name="location" type="text" class="mt-1 block w-full" :value="old('location', $meterBox->location ?? '')" />
    <x-input-error :messages="$errors->get('location')" class="mt-2" />
</div>

@if ($canChooseBranch)
    <div class="mt-4">
        <x-input-label for="branch_id"><span>{{ __('Branch') }}</span> <span class="text-red-500">*</span></x-input-label>
        @if ($branches->isEmpty())
            <p class="mt-1 text-sm text-gray-500">{{ __('No branches exist yet — create one first.') }}</p>
        @else
            <select id="branch_id" name="branch_id" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
                <option value="">{{ __('— Select Branch —') }}</option>
                @foreach ($branches as $branch)
                    <option value="{{ $branch->id }}" @selected((string) old('branch_id', $meterBox->branch_id ?? '') === (string) $branch->id)>
                        {{ $branch->name }}
                        @if ($branch->governorate || $branch->area)
                            — {{ collect([$branch->governorate?->name, $branch->area?->name])->filter()->implode(' / ') }}
                        @endif
                    </option>
                @endforeach
            </select>
        @endif
        <x-input-error :messages="$errors->get('branch_id')" class="mt-2" />
    </div>
@else
    <p class="mt-4 text-sm text-gray-500">{{ __('This meter box will belong to your branch.') }}</p>
@endif
