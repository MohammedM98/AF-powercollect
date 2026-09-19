<div>
    <x-input-label for="full_name" :value="__('Full Name')" />
    <x-text-input id="full_name" name="full_name" type="text" class="mt-1 block w-full" :value="old('full_name', $subscriber->full_name ?? '')" required autofocus />
    <x-input-error :messages="$errors->get('full_name')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="phone" :value="__('Phone')" />
    <x-text-input id="phone" name="phone" type="text" class="mt-1 block w-full" dir="ltr" :value="old('phone', $subscriber->phone ?? '')" />
    <x-input-error :messages="$errors->get('phone')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="address" :value="__('Address')" />
    <textarea id="address" name="address" rows="3" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500">{{ old('address', $subscriber->address ?? '') }}</textarea>
    <x-input-error :messages="$errors->get('address')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="meter_number" :value="__('Meter Number')" />
    <x-text-input id="meter_number" name="meter_number" type="text" class="mt-1 block w-full" dir="ltr" :value="old('meter_number', $subscriber->meter_number ?? '')" required />
    <x-input-error :messages="$errors->get('meter_number')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="meter_box_id" :value="__('Meter Box')" />
    @if ($meterBoxes->isEmpty())
        <p class="mt-1 text-sm text-gray-500">{{ __('No meter boxes exist yet — the subscriber can be registered without one for now.') }}</p>
    @else
        <select id="meter_box_id" name="meter_box_id" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
            <option value="">{{ __('— No Meter Box Yet —') }}</option>
            @foreach ($meterBoxes as $box)
                <option value="{{ $box->id }}" @selected((string) old('meter_box_id', $subscriber->meter_box_id ?? '') === (string) $box->id)>{{ $box->box_number }} — {{ $box->branch->name }}</option>
            @endforeach
        </select>
    @endif
    <x-input-error :messages="$errors->get('meter_box_id')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="tariff_id" :value="__('Tariff')" />
    <select id="tariff_id" name="tariff_id" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
        <option value="">{{ __('— Select Tariff —') }}</option>
        @foreach ($tariffs as $tariff)
            <option value="{{ $tariff->id }}" @selected((string) old('tariff_id', $subscriber->tariff_id ?? '') === (string) $tariff->id)>{{ __($tariff->category->label()) }}</option>
        @endforeach
    </select>
    <x-input-error :messages="$errors->get('tariff_id')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="status" :value="__('Status')" />
    <select id="status" name="status" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
        @foreach (\App\Enums\SubscriberStatus::cases() as $status)
            <option value="{{ $status->value }}" @selected(old('status', $subscriber->status->value ?? \App\Enums\SubscriberStatus::Active->value) === $status->value)>{{ __($status->label()) }}</option>
        @endforeach
    </select>
    <x-input-error :messages="$errors->get('status')" class="mt-2" />
</div>

@if ($canChooseBranch)
    <div class="mt-4">
        <x-input-label for="branch_id" :value="__('Branch')" />
        @if ($branches->isEmpty())
            <p class="mt-1 text-sm text-gray-500">{{ __('No branches exist yet — create one first.') }}</p>
        @else
            <select id="branch_id" name="branch_id" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
                <option value="">{{ __('— Select Branch —') }}</option>
                @foreach ($branches as $branch)
                    <option value="{{ $branch->id }}" @selected((string) old('branch_id', $subscriber->branch_id ?? '') === (string) $branch->id)>{{ $branch->name }}</option>
                @endforeach
            </select>
        @endif
        <x-input-error :messages="$errors->get('branch_id')" class="mt-2" />
    </div>
@else
    <p class="mt-4 text-sm text-gray-500">{{ __('This subscriber will belong to your branch.') }}</p>
@endif
