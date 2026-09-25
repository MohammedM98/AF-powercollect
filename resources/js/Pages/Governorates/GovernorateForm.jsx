import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';

/**
 * The form's starting values: the governorate's own when editing,
 * otherwise blank.
 */
export function governorateFormData(governorate) {
    return { name: governorate?.name ?? '' };
}

export default function GovernorateForm({ data, setData, errors }) {
    return (
        <div>
            <InputLabel htmlFor="name" value="الاسم" />
            <TextInput id="name" className="mt-1 block w-full" value={data.name} autoFocus onChange={(e) => setData('name', e.target.value)} />
            <InputError message={errors.name} className="mt-2" />
        </div>
    );
}
