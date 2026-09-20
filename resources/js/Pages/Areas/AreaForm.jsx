import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';

export default function AreaForm({ data, setData, errors }) {
    return (
        <div>
            <InputLabel htmlFor="name" value="الاسم" />
            <TextInput id="name" className="mt-1 block w-full" value={data.name} autoFocus onChange={(e) => setData('name', e.target.value)} />
            <InputError message={errors.name} className="mt-2" />
        </div>
    );
}
