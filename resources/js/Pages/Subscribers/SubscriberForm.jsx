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

export default function SubscriberForm({ data, setData, errors, meterBoxes, tariffs, circuitBreakers, branches, canChooseBranch }) {
    return (
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="full_name" label="الاسم" required error={errors.full_name}>
                <TextInput className="block w-full" value={data.full_name} autoFocus onChange={(e) => setData('full_name', e.target.value)} />
            </Field>

            <Field id="national_id" label="الرقم الوطني" required error={errors.national_id}>
                <TextInput
                    required
                    dir="ltr"
                    inputMode="numeric"
                    maxLength={9}
                    className="block w-full"
                    value={data.national_id ?? ''}
                    onChange={(event) => setData('national_id', event.target.value)}
                />
            </Field>

            <Field id="phone" label="رقم الجوال" required error={errors.phone}>
                <TextInput dir="ltr" className="block w-full" value={data.phone} onChange={(e) => setData('phone', e.target.value)} />
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

            <Field id="notes" label="معلومات أخرى" required error={errors.notes} span="sm:col-span-2 lg:col-span-3">
                <textarea
                    rows={2}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500"
                    value={data.notes}
                    onChange={(e) => setData('notes', e.target.value)}
                />
            </Field>

            <Field id="circuit_breaker_id" label="القاطع" error={errors.circuit_breaker_id}>
                <select
                    className="block w-full rounded-md border-gray-300 shadow-sm"
                    value={data.circuit_breaker_id}
                    onChange={(e) => setData('circuit_breaker_id', e.target.value)}
                >
                    <option value="">---</option>
                    {circuitBreakers.map((circuitBreaker) => (
                        <option key={circuitBreaker.id} value={circuitBreaker.id}>
                            {circuitBreaker.ampere}A — {Number(circuitBreaker.minimum_payment).toFixed(2)} ₪
                        </option>
                    ))}
                </select>
            </Field>

            <Field id="meter_box_id" label="رقم الطبلون" error={errors.meter_box_id}>
                {meterBoxes.length === 0 ? (
                    <p className="text-sm text-gray-500">لا توجد طبلونات بعد.</p>
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

            <Field id="initial_reading" label="القراءة الابتدائية" required error={errors.initial_reading}>
                <TextInput
                    type="number"
                    required
                    min={0}
                    step={1}
                    className="block w-full"
                    value={data.initial_reading}
                    onChange={(event) => setData('initial_reading', event.target.value)}
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

            <Field id="subscription_fee" label="رسوم الاشتراك (₪)" error={errors.subscription_fee}>
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
