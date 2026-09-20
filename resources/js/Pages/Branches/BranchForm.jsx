import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';

export default function BranchForm({ data, setData, errors, governorates }) {
    return (
        <>
            <div>
                <InputLabel htmlFor="name" value="الاسم" />
                <TextInput
                    id="name"
                    className="mt-1 block w-full"
                    value={data.name}
                    autoFocus
                    onChange={(e) => setData('name', e.target.value)}
                />
                <InputError message={errors.name} className="mt-2" />
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

            <div className="mt-4">
                <InputLabel htmlFor="phone" value="الهاتف" />
                <TextInput
                    id="phone"
                    dir="ltr"
                    className="mt-1 block w-full"
                    value={data.phone}
                    onChange={(e) => setData('phone', e.target.value)}
                />
                <InputError message={errors.phone} className="mt-2" />
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

            <div className="mt-4 flex items-center">
                <input
                    type="checkbox"
                    id="is_active"
                    className="rounded border-gray-300 text-brand-600 shadow-sm"
                    checked={data.is_active}
                    onChange={(e) => setData('is_active', e.target.checked)}
                />
                <InputLabel htmlFor="is_active" value="نشط" className="!mb-0 ms-2" />
            </div>
        </>
    );
}
