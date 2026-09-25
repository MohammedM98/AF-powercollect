import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';

/**
 * The form's starting values: the area's own when editing, otherwise
 * blank — optionally already placed in `defaultGovernorateId`.
 */
export function areaFormData(area, defaultGovernorateId = '') {
    return area ? { name: area.name, governorate_id: area.governorate_id ?? '' } : { name: '', governorate_id: defaultGovernorateId };
}

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
                        className="mt-1 block w-full"
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
