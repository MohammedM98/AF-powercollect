import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';

export default function AreaForm({ data, setData, errors, governorates }) {
    return (
        <>
            <div>
                <InputLabel htmlFor="name" value="الاسم" />
                <TextInput id="name" className="mt-1 block w-full" value={data.name} autoFocus onChange={(e) => setData('name', e.target.value)} />
                <InputError message={errors.name} className="mt-2" />
            </div>

            <div className="mt-4">
                <InputLabel htmlFor="governorate_id" value="المحافظة" />
                {governorates.length === 0 ? (
                    <p className="mt-1 text-sm text-gray-500">لا توجد محافظات بعد.</p>
                ) : (
                    <select
                        id="governorate_id"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                        value={data.governorate_id}
                        onChange={(e) => setData('governorate_id', e.target.value)}
                    >
                        <option value="">— بلا محافظة —</option>
                        {governorates.map((governorate) => (
                            <option key={governorate.id} value={governorate.id}>
                                {governorate.name}
                            </option>
                        ))}
                    </select>
                )}
                <InputError message={errors.governorate_id} className="mt-2" />
            </div>
        </>
    );
}
