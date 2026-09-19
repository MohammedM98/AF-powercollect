import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';

const STATUS_OPTIONS = [
    { value: 'active', label: 'نشط' },
    { value: 'suspended', label: 'موقوف' },
    { value: 'disconnected', label: 'مقطوع' },
];

export default function SubscriberForm({ data, setData, errors, meterBoxes, tariffs, branches, canChooseBranch }) {
    return (
        <>
            <div>
                <InputLabel htmlFor="full_name" value="الاسم الكامل" />
                <TextInput
                    id="full_name"
                    className="mt-1 block w-full"
                    value={data.full_name}
                    autoFocus
                    onChange={(e) => setData('full_name', e.target.value)}
                />
                <InputError message={errors.full_name} className="mt-2" />
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
                <InputLabel htmlFor="address" value="العنوان" />
                <textarea
                    id="address"
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500"
                    value={data.address}
                    onChange={(e) => setData('address', e.target.value)}
                />
                <InputError message={errors.address} className="mt-2" />
            </div>

            <div className="mt-4">
                <InputLabel htmlFor="meter_number" value="رقم العداد" />
                <TextInput
                    id="meter_number"
                    dir="ltr"
                    className="mt-1 block w-full"
                    value={data.meter_number}
                    onChange={(e) => setData('meter_number', e.target.value)}
                />
                <InputError message={errors.meter_number} className="mt-2" />
            </div>

            <div className="mt-4">
                <InputLabel htmlFor="meter_box_id" value="صندوق العداد" />
                {meterBoxes.length === 0 ? (
                    <p className="mt-1 text-sm text-gray-500">لا توجد صناديق عدادات بعد — يمكن تسجيل المشترك بدون صندوق حاليًا.</p>
                ) : (
                    <select
                        id="meter_box_id"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                        value={data.meter_box_id}
                        onChange={(e) => setData('meter_box_id', e.target.value)}
                    >
                        <option value="">— بلا صندوق عداد بعد —</option>
                        {meterBoxes.map((box) => (
                            <option key={box.id} value={box.id}>
                                {box.box_number} — {box.branchName}
                            </option>
                        ))}
                    </select>
                )}
                <InputError message={errors.meter_box_id} className="mt-2" />
            </div>

            <div className="mt-4">
                <InputLabel htmlFor="tariff_id" value="التعرفة" />
                <select
                    id="tariff_id"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                    value={data.tariff_id}
                    onChange={(e) => setData('tariff_id', e.target.value)}
                >
                    <option value="">— اختر تعرفة —</option>
                    {tariffs.map((tariff) => (
                        <option key={tariff.id} value={tariff.id}>
                            {tariff.categoryLabel}
                        </option>
                    ))}
                </select>
                <InputError message={errors.tariff_id} className="mt-2" />
            </div>

            <div className="mt-4">
                <InputLabel htmlFor="status" value="الحالة" />
                <select
                    id="status"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                    value={data.status}
                    onChange={(e) => setData('status', e.target.value)}
                >
                    {STATUS_OPTIONS.map((status) => (
                        <option key={status.value} value={status.value}>
                            {status.label}
                        </option>
                    ))}
                </select>
                <InputError message={errors.status} className="mt-2" />
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
                <p className="mt-4 text-sm text-gray-500">سينتمي هذا المشترك إلى فرعك.</p>
            )}
        </>
    );
}
