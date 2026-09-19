import { cloneElement } from 'react';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';

const STATUS_OPTIONS = [
    { value: 'active', label: 'نشط' },
    { value: 'suspended', label: 'موقوف' },
    { value: 'disconnected', label: 'مقطوع' },
];

function Field({ id, label, required, error, span = '', children }) {
    return (
        <div className={span}>
            <InputLabel htmlFor={id}>
                {label}
                {required && <span className="text-red-500"> *</span>}
            </InputLabel>
            <div className="mt-1">{cloneElement(children, { id })}</div>
            <InputError message={error} className="mt-1" />
        </div>
    );
}

export default function SubscriberForm({ data, setData, errors, meterBoxes, tariffs, branches, billingTypeOptions, canChooseBranch }) {
    return (
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="full_name" label="الاسم" required error={errors.full_name}>
                <TextInput className="block w-full" value={data.full_name} autoFocus onChange={(e) => setData('full_name', e.target.value)} />
            </Field>

            <Field id="phone" label="رقم الجوال" required error={errors.phone}>
                <TextInput dir="ltr" className="block w-full" value={data.phone} onChange={(e) => setData('phone', e.target.value)} />
            </Field>

            <Field id="billing_type" label="نوع التحاسب" required error={errors.billing_type}>
                <select
                    className="block w-full rounded-md border-gray-300 shadow-sm"
                    value={data.billing_type}
                    onChange={(e) => setData('billing_type', e.target.value)}
                >
                    <option value="">---</option>
                    {billingTypeOptions.map((type) => (
                        <option key={type.value} value={type.value}>
                            {type.label}
                        </option>
                    ))}
                </select>
            </Field>

            <Field id="status" label="الحالة" required error={errors.status}>
                <select
                    className="block w-full rounded-md border-gray-300 shadow-sm"
                    value={data.status}
                    onChange={(e) => setData('status', e.target.value)}
                >
                    {STATUS_OPTIONS.map((status) => (
                        <option key={status.value} value={status.value}>
                            {status.label}
                        </option>
                    ))}
                </select>
            </Field>

            <Field id="unit_price" label="السعر" required error={errors.unit_price}>
                <TextInput
                    type="number"
                    step="0.01"
                    className="block w-full"
                    value={data.unit_price}
                    onChange={(e) => setData('unit_price', e.target.value)}
                />
            </Field>

            <Field id="minimum_charge" label="الحد الادنى" required error={errors.minimum_charge}>
                <TextInput
                    type="number"
                    step="0.01"
                    className="block w-full"
                    value={data.minimum_charge}
                    onChange={(e) => setData('minimum_charge', e.target.value)}
                />
            </Field>

            <Field id="address" label="العنوان" required error={errors.address} span="sm:col-span-2 lg:col-span-3">
                <textarea
                    rows={2}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500"
                    value={data.address}
                    onChange={(e) => setData('address', e.target.value)}
                />
            </Field>

            <Field id="notes" label="معلومات أخرى" required error={errors.notes} span="sm:col-span-2 lg:col-span-3">
                <textarea
                    rows={2}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500"
                    value={data.notes}
                    onChange={(e) => setData('notes', e.target.value)}
                />
            </Field>

            <Field id="area_1" label="المنطقة 1" error={errors.area_1}>
                <TextInput className="block w-full" value={data.area_1} onChange={(e) => setData('area_1', e.target.value)} />
            </Field>

            <Field id="area_2" label="المنطقة 2" error={errors.area_2}>
                <TextInput className="block w-full" value={data.area_2} onChange={(e) => setData('area_2', e.target.value)} />
            </Field>

            <Field id="ampere_count" label="عدد الامبير" error={errors.ampere_count}>
                <TextInput
                    type="number"
                    className="block w-full"
                    value={data.ampere_count}
                    onChange={(e) => setData('ampere_count', e.target.value)}
                />
            </Field>

            <Field id="meter_box_id" label="رقم الطبلون (صندوق العداد)" error={errors.meter_box_id}>
                {meterBoxes.length === 0 ? (
                    <p className="text-sm text-gray-500">لا توجد صناديق عدادات بعد.</p>
                ) : (
                    <select
                        className="block w-full rounded-md border-gray-300 shadow-sm"
                        value={data.meter_box_id}
                        onChange={(e) => setData('meter_box_id', e.target.value)}
                    >
                        <option value="">---</option>
                        {meterBoxes.map((box) => (
                            <option key={box.id} value={box.id}>
                                {box.box_number} — {box.branchName}
                            </option>
                        ))}
                    </select>
                )}
            </Field>

            <Field id="customer_classification" label="تصنيف الزبائن" error={errors.customer_classification}>
                <TextInput
                    className="block w-full"
                    value={data.customer_classification}
                    onChange={(e) => setData('customer_classification', e.target.value)}
                />
            </Field>

            <Field id="previous_reading" label="القراءة السابقة" error={errors.previous_reading}>
                <TextInput
                    type="number"
                    className="block w-full"
                    value={data.previous_reading}
                    onChange={(e) => setData('previous_reading', e.target.value)}
                />
            </Field>

            <Field id="meter_number" label="رقم العداد" required error={errors.meter_number}>
                <TextInput
                    dir="ltr"
                    className="block w-full"
                    value={data.meter_number}
                    onChange={(e) => setData('meter_number', e.target.value)}
                />
            </Field>

            <Field id="tariff_id" label="التعرفة" required error={errors.tariff_id}>
                <select
                    className="block w-full rounded-md border-gray-300 shadow-sm"
                    value={data.tariff_id}
                    onChange={(e) => setData('tariff_id', e.target.value)}
                >
                    <option value="">---</option>
                    {tariffs.map((tariff) => (
                        <option key={tariff.id} value={tariff.id}>
                            {tariff.categoryLabel}
                        </option>
                    ))}
                </select>
            </Field>

            <Field id="subscription_fee" label="رسوم الاشتراك" error={errors.subscription_fee}>
                <TextInput
                    type="number"
                    step="0.01"
                    className="block w-full"
                    value={data.subscription_fee}
                    onChange={(e) => setData('subscription_fee', e.target.value)}
                />
            </Field>

            <Field id="subscription_date" label="تاريخ الاشتراك" error={errors.subscription_date}>
                <TextInput
                    type="date"
                    className="block w-full"
                    value={data.subscription_date}
                    onChange={(e) => setData('subscription_date', e.target.value)}
                />
            </Field>

            <div className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3 sm:col-span-1">
                <InputLabel value="تحميل رسوم الاشتراك" className="!mb-0" />
                <button
                    type="button"
                    onClick={() => setData('charge_subscription_fee', !data.charge_subscription_fee)}
                    className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                        data.charge_subscription_fee ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-600'
                    }`}
                >
                    {data.charge_subscription_fee ? 'نعم' : 'لا'}
                </button>
            </div>

            {canChooseBranch && (
                <Field id="branch_id" label="الفرع" required error={errors.branch_id}>
                    {branches.length === 0 ? (
                        <p className="text-sm text-gray-500">لا توجد فروع بعد — أنشئ فرعًا أولاً.</p>
                    ) : (
                        <select
                            className="block w-full rounded-md border-gray-300 shadow-sm"
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
                </Field>
            )}
        </div>
    );
}
