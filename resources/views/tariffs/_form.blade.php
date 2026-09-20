<div>
    <x-input-label for="category" :value="__('Category')" />
    <select id="category" name="category" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
        @foreach ($categoryOptions as $option)
            <option value="{{ $option['value'] }}" @selected((string) old('category', $tariff->category->value ?? '') === (string) $option['value'])>{{ $option['label'] }}</option>
        @endforeach
    </select>
    <x-input-error :messages="$errors->get('category')" class="mt-2" />
</div>

<div class="mt-4">
    <x-input-label for="rate" :value="__('Rate')" />
    <x-text-input id="rate" name="rate" type="number" step="0.01" class="mt-1 block w-full" :value="old('rate', $tariff->rate ?? '')" required />
    <x-input-error :messages="$errors->get('rate')" class="mt-2" />
</div>
