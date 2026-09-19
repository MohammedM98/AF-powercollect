<div class="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
    <div>
        <x-input-label for="full_name"><span>{{ __('Full Name') }}</span> <span class="text-red-500">*</span></x-input-label>
        <x-text-input id="full_name" name="full_name" type="text" class="mt-1 block w-full" :value="old('full_name', $subscriber->full_name ?? '')" required autofocus />
        <x-input-error :messages="$errors->get('full_name')" class="mt-1" />
    </div>

    <div>
        <x-input-label for="phone"><span>{{ __('Phone') }}</span> <span class="text-red-500">*</span></x-input-label>
        <x-text-input id="phone" name="phone" type="text" class="mt-1 block w-full" dir="ltr" :value="old('phone', $subscriber->phone ?? '')" required />
        <x-input-error :messages="$errors->get('phone')" class="mt-1" />
    </div>

    <div>
        <x-input-label for="billing_type"><span>{{ __('Billing Type') }}</span> <span class="text-red-500">*</span></x-input-label>
        <select id="billing_type" name="billing_type" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
            <option value="">---</option>
            @foreach (\App\Enums\BillingType::cases() as $type)
                <option value="{{ $type->value }}" @selected(old('billing_type', $subscriber->billing_type->value ?? '') === $type->value)>{{ __($type->label()) }}</option>
            @endforeach
        </select>
        <x-input-error :messages="$errors->get('billing_type')" class="mt-1" />
    </div>

    <div>
        <x-input-label for="status"><span>{{ __('Status') }}</span> <span class="text-red-500">*</span></x-input-label>
        <select id="status" name="status" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
            @foreach (\App\Enums\SubscriberStatus::cases() as $status)
                <option value="{{ $status->value }}" @selected(old('status', $subscriber->status->value ?? \App\Enums\SubscriberStatus::Active->value) === $status->value)>{{ __($status->label()) }}</option>
            @endforeach
        </select>
        <x-input-error :messages="$errors->get('status')" class="mt-1" />
    </div>

    <div>
        <x-input-label for="unit_price"><span>{{ __('Price') }}</span> <span class="text-red-500">*</span></x-input-label>
        <x-text-input id="unit_price" name="unit_price" type="number" step="0.01" class="mt-1 block w-full" :value="old('unit_price', $subscriber->unit_price ?? '')" required />
        <x-input-error :messages="$errors->get('unit_price')" class="mt-1" />
    </div>

    <div>
        <x-input-label for="minimum_charge"><span>{{ __('Minimum Charge') }}</span> <span class="text-red-500">*</span></x-input-label>
        <x-text-input id="minimum_charge" name="minimum_charge" type="number" step="0.01" class="mt-1 block w-full" :value="old('minimum_charge', $subscriber->minimum_charge ?? '')" required />
        <x-input-error :messages="$errors->get('minimum_charge')" class="mt-1" />
    </div>

    <div class="sm:col-span-2 lg:col-span-3">
        <x-input-label for="address"><span>{{ __('Address') }}</span> <span class="text-red-500">*</span></x-input-label>
        <textarea id="address" name="address" rows="2" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500">{{ old('address', $subscriber->address ?? '') }}</textarea>
        <x-input-error :messages="$errors->get('address')" class="mt-1" />
    </div>

    <div class="sm:col-span-2 lg:col-span-3">
        <x-input-label for="notes"><span>{{ __('Other Information') }}</span> <span class="text-red-500">*</span></x-input-label>
        <textarea id="notes" name="notes" rows="2" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500">{{ old('notes', $subscriber->notes ?? '') }}</textarea>
        <x-input-error :messages="$errors->get('notes')" class="mt-1" />
    </div>

    <div>
        <x-input-label for="area_1" :value="__('Area 1')" />
        <x-text-input id="area_1" name="area_1" type="text" class="mt-1 block w-full" :value="old('area_1', $subscriber->area_1 ?? '')" />
        <x-input-error :messages="$errors->get('area_1')" class="mt-1" />
    </div>

    <div>
        <x-input-label for="area_2" :value="__('Area 2')" />
        <x-text-input id="area_2" name="area_2" type="text" class="mt-1 block w-full" :value="old('area_2', $subscriber->area_2 ?? '')" />
        <x-input-error :messages="$errors->get('area_2')" class="mt-1" />
    </div>

    <div>
        <x-input-label for="ampere_count" :value="__('Ampere Count')" />
        <x-text-input id="ampere_count" name="ampere_count" type="number" class="mt-1 block w-full" :value="old('ampere_count', $subscriber->ampere_count ?? '')" />
        <x-input-error :messages="$errors->get('ampere_count')" class="mt-1" />
    </div>

    <div>
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
        <x-input-error :messages="$errors->get('meter_box_id')" class="mt-1" />
    </div>

    <div>
        <x-input-label for="customer_classification" :value="__('Customer Classification')" />
        <x-text-input id="customer_classification" name="customer_classification" type="text" class="mt-1 block w-full" :value="old('customer_classification', $subscriber->customer_classification ?? '')" />
        <x-input-error :messages="$errors->get('customer_classification')" class="mt-1" />
    </div>

    <div>
        <x-input-label for="previous_reading" :value="__('Previous Reading')" />
        <x-text-input id="previous_reading" name="previous_reading" type="number" class="mt-1 block w-full" :value="old('previous_reading', $subscriber->previous_reading ?? '')" />
        <x-input-error :messages="$errors->get('previous_reading')" class="mt-1" />
    </div>

    <div>
        <x-input-label for="meter_number"><span>{{ __('Meter Number') }}</span> <span class="text-red-500">*</span></x-input-label>
        <x-text-input id="meter_number" name="meter_number" type="text" class="mt-1 block w-full" dir="ltr" :value="old('meter_number', $subscriber->meter_number ?? '')" required />
        <x-input-error :messages="$errors->get('meter_number')" class="mt-1" />
    </div>

    <div>
        <x-input-label for="tariff_id"><span>{{ __('Tariff') }}</span> <span class="text-red-500">*</span></x-input-label>
        <select id="tariff_id" name="tariff_id" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
            <option value="">{{ __('— Select Tariff —') }}</option>
            @foreach ($tariffs as $tariff)
                <option value="{{ $tariff->id }}" @selected((string) old('tariff_id', $subscriber->tariff_id ?? '') === (string) $tariff->id)>{{ __($tariff->category->label()) }}</option>
            @endforeach
        </select>
        <x-input-error :messages="$errors->get('tariff_id')" class="mt-1" />
    </div>

    <div>
        <x-input-label for="subscription_fee" :value="__('Subscription Fee')" />
        <x-text-input id="subscription_fee" name="subscription_fee" type="number" step="0.01" class="mt-1 block w-full" :value="old('subscription_fee', $subscriber->subscription_fee ?? '')" />
        <x-input-error :messages="$errors->get('subscription_fee')" class="mt-1" />
    </div>

    <div>
        <x-input-label for="subscription_date" :value="__('Subscription Date')" />
        <x-text-input id="subscription_date" name="subscription_date" type="date" class="mt-1 block w-full" :value="old('subscription_date', optional($subscriber->subscription_date ?? null)->format('Y-m-d'))" />
        <x-input-error :messages="$errors->get('subscription_date')" class="mt-1" />
    </div>

    <div class="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3">
        <input type="hidden" name="charge_subscription_fee" value="0">
        <x-input-label for="charge_subscription_fee" :value="__('Charge Subscription Fee')" class="!mb-0" />
        <label class="relative inline-flex cursor-pointer items-center">
            <input type="checkbox" id="charge_subscription_fee" name="charge_subscription_fee" value="1" class="peer sr-only" @checked(old('charge_subscription_fee', $subscriber->charge_subscription_fee ?? true))>
            <span class="rounded-full bg-gray-200 px-4 py-1.5 text-xs font-bold text-gray-600 peer-checked:bg-emerald-500 peer-checked:text-white">
                {{ __('Yes') }}
            </span>
        </label>
        <x-input-error :messages="$errors->get('charge_subscription_fee')" class="mt-1" />
    </div>

    @if ($canChooseBranch)
        <div>
            <x-input-label for="branch_id"><span>{{ __('Branch') }}</span> <span class="text-red-500">*</span></x-input-label>
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
            <x-input-error :messages="$errors->get('branch_id')" class="mt-1" />
        </div>
    @else
        <p class="text-sm text-gray-500">{{ __('This subscriber will belong to your branch.') }}</p>
    @endif
</div>
