import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';

/**
 * The form's starting values: the tariff's own when editing, otherwise
 * blank with the first category preselected.
 */
export function tariffFormData(tariff, categoryOptions) {
    return tariff
        ? { category: tariff.category, rate: tariff.rate }
        : { category: categoryOptions[0]?.value ?? '', rate: '' };
}

export default function TariffForm({ data, setData, errors, categoryOptions }) {
    return (
        <>
            <div>
                <InputLabel htmlFor="category" value="الفئة" />
                <select
                    id="category"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                    value={data.category}
                    onChange={(e) => setData('category', e.target.value)}
                >
                    {categoryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <InputError message={errors.category} className="mt-2" />
            </div>

            <div className="mt-4">
                <InputLabel htmlFor="rate" value="السعر (شيكل)" />
                <TextInput
                    id="rate"
                    type="number"
                    step="0.01"
                    className="mt-1 block w-full"
                    value={data.rate}
                    onChange={(e) => setData('rate', e.target.value)}
                />
                <InputError message={errors.rate} className="mt-2" />
            </div>
        </>
    );
}
