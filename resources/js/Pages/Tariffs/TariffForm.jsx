import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';

/**
 * The form's starting values: the tariff's own when editing, otherwise blank.
 */
export function tariffFormData(tariff) {
    return tariff ? { name: tariff.name, rate: tariff.rate } : { name: '', rate: '' };
}

export default function TariffForm({ data, setData, errors }) {
    return (
        <>
            <div>
                <InputLabel htmlFor="name" value="اسم التعرفة" />
                <TextInput
                    id="name"
                    type="text"
                    maxLength={255}
                    placeholder="مثال: منزلي، تجاري، مساجد"
                    className="mt-1 block w-full"
                    value={data.name}
                    onChange={(e) => setData('name', e.target.value)}
                />
                <InputError message={errors.name} className="mt-2" />
            </div>

            <div className="mt-4">
                <InputLabel htmlFor="rate" value="سعر الكيلو (شيكل)" />
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
