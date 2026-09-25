import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';

/**
 * The form's starting values: the sub-area's own when editing, otherwise
 * blank — optionally already placed in `defaultAreaId`.
 */
export function subAreaFormData(subArea, defaultAreaId = '') {
    return subArea ? { name: subArea.name, area_id: subArea.area_id ?? '' } : { name: '', area_id: defaultAreaId };
}

/**
 * `allowNoArea` offers "— no area —"; only a super admin may leave a
 * sub-area outside any area, everyone else places it in their branch's.
 */
export default function SubAreaForm({ data, setData, errors, areas, allowNoArea = true }) {
    return (
        <>
            <div>
                <InputLabel htmlFor="name" value="الاسم" />
                <TextInput id="name" className="mt-1 block w-full" value={data.name} autoFocus onChange={(e) => setData('name', e.target.value)} />
                <InputError message={errors.name} className="mt-2" />
            </div>

            <div className="mt-4">
                <InputLabel htmlFor="area_id" value="المنطقة" />
                {areas.length === 0 ? (
                    <p className="mt-1 text-sm text-gray-500">لا توجد مناطق بعد.</p>
                ) : (
                    <select id="area_id" className="mt-1 block w-full" value={data.area_id} onChange={(e) => setData('area_id', e.target.value)}>
                        {(allowNoArea || data.area_id === '') && <option value="">{allowNoArea ? '— بلا منطقة —' : '— اختر منطقة —'}</option>}
                        {areas.map((area) => (
                            <option key={area.id} value={area.id}>
                                {area.name}
                            </option>
                        ))}
                    </select>
                )}
                <InputError message={errors.area_id} className="mt-2" />
            </div>
        </>
    );
}
