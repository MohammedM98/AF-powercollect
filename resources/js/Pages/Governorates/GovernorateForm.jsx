import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';

export default function GovernorateForm({ data, setData, errors, areas, currentGovernorateName }) {
    function toggleArea(areaId) {
        setData('area_ids', data.area_ids.includes(areaId) ? data.area_ids.filter((id) => id !== areaId) : [...data.area_ids, areaId]);
    }

    return (
        <>
            <div>
                <InputLabel htmlFor="name" value="الاسم" />
                <TextInput id="name" className="mt-1 block w-full" value={data.name} autoFocus onChange={(e) => setData('name', e.target.value)} />
                <InputError message={errors.name} className="mt-2" />
            </div>

            <div className="mt-4">
                <InputLabel value="المناطق" />
                <p className="mt-1 text-sm text-gray-500">حدد كل منطقة تابعة لهذه المحافظة.</p>

                {areas.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">لا توجد مناطق بعد.</p>
                ) : (
                    <div className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-md border border-gray-200 p-3">
                        {areas.map((area) => (
                            <label key={area.id} className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-brand-600 shadow-sm focus:ring-brand-500"
                                    checked={data.area_ids.includes(area.id)}
                                    onChange={() => toggleArea(area.id)}
                                />
                                {area.name}
                                {area.governorateName && area.governorateName !== currentGovernorateName && (
                                    <span className="text-xs text-gray-400">(حاليًا في {area.governorateName})</span>
                                )}
                            </label>
                        ))}
                    </div>
                )}
                <InputError message={errors.area_ids} className="mt-2" />
            </div>
        </>
    );
}
