import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';

export default function MeterBoxForm({ data, setData, errors, branches, canChooseBranch }) {
    return (
        <>
            <div>
                <InputLabel htmlFor="box_number" value="رقم الصندوق" />
                <TextInput
                    id="box_number"
                    dir="ltr"
                    className="mt-1 block w-full"
                    value={data.box_number}
                    autoFocus
                    onChange={(e) => setData('box_number', e.target.value)}
                />
                <InputError message={errors.box_number} className="mt-2" />
            </div>

            <div className="mt-4">
                <InputLabel htmlFor="area" value="المنطقة" />
                <TextInput id="area" className="mt-1 block w-full" value={data.area} onChange={(e) => setData('area', e.target.value)} />
                <InputError message={errors.area} className="mt-2" />
            </div>

            <div className="mt-4">
                <InputLabel htmlFor="location" value="الموقع" />
                <TextInput
                    id="location"
                    className="mt-1 block w-full"
                    value={data.location}
                    onChange={(e) => setData('location', e.target.value)}
                />
                <InputError message={errors.location} className="mt-2" />
            </div>

            {canChooseBranch ? (
                <div className="mt-4">
                    <InputLabel htmlFor="branch_id" value="الفرع" />
                    {branches.length === 0 ? (
                        <p className="mt-1 text-sm text-gray-500">لا توجد فروع بعد — أنشئ فرعًا أولاً.</p>
                    ) : (
                        <select
                            id="branch_id"
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                            value={data.branch_id}
                            onChange={(e) => setData('branch_id', e.target.value)}
                        >
                            <option value="">— اختر فرعًا —</option>
                            {branches.map((branch) => (
                                <option key={branch.id} value={branch.id}>
                                    {branch.name}
                                </option>
                            ))}
                        </select>
                    )}
                    <InputError message={errors.branch_id} className="mt-2" />
                </div>
            ) : (
                <p className="mt-4 text-sm text-gray-500">سينتمي صندوق العداد هذا إلى فرعك.</p>
            )}
        </>
    );
}
