import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';

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
                <InputLabel htmlFor="rate" value="السعر (₪)" />
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
