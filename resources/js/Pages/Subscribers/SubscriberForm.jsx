import { cloneElement, useState } from 'react';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';
import SearchableSelect from '@/Components/SearchableSelect';

const STATUS_OPTIONS = [
    { value: 'active', label: 'نشط' },
    { value: 'suspended', label: 'مفصول' },
    { value: 'disconnected', label: 'مقطوع' },
];

function Section({ title, children }) {
    return (
        <div className="col-span-full">
            <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
            <div className="mt-2 border-b border-gray-100" />
        </div>
    );
}

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

// A value the form shows but never lets the user edit directly (it's
// derived from another selection, like the branch's area or the chosen
// tariff's rate).
function FieldLock() {
    return (
        <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-gray-400" aria-hidden="true">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6a4.5 4.5 0 0 0-9 0v4.5m-.75 0h10.5A2.25 2.25 0 0 1 19.5 12.75v6A2.25 2.25 0 0 1 17.25 21H6.75a2.25 2.25 0 0 1-2.25-2.25v-6a2.25 2.25 0 0 1 2.25-2.25Z" />
            </svg>
        </span>
    );
}

function ReadOnlyField({ id, label, value, dir }) {
    return (
        <div>
            <InputLabel htmlFor={id} value={label} />
            <div className="relative mt-1" dir={dir}>
                <TextInput id={id} readOnly value={value} title="للقراءة فقط" className="w-full bg-gray-50 pe-10 text-gray-600" />
                <FieldLock />
            </div>
        </div>
    );
}

/**
 * The form's starting values: the subscriber's own when editing,
 * otherwise blank. New subscribers start out suspended (مفصول).
 */
export function subscriberFormData(subscriber) {
    return {
        full_name: subscriber?.full_name ?? '',
        national_id: subscriber?.national_id ?? '',
        phone: subscriber?.phone ?? '',
        address: subscriber?.address ?? '',
        meter_box_id: subscriber?.meter_box_id ?? '',
        tariff_id: subscriber?.tariff_id ?? '',
        status: subscriber?.status ?? 'suspended',
        branch_id: subscriber?.branch_id ?? '',
        circuit_breaker_id: subscriber?.circuit_breaker_id ?? '',
        minimum_charge: subscriber?.minimum_charge != null ? Number(subscriber.minimum_charge) : '',
        initial_reading: subscriber?.initial_reading ?? '',
        subscription_fee: subscriber?.subscription_fee ?? '',
        subscription_date: subscriber?.subscription_date ?? '',
        notes: subscriber?.notes ?? '',
    };
}

export default function SubscriberForm({
    data,
    setData,
    errors,
    meterBoxes,
    tariffs,
    circuitBreakers,
    branches,
    subAreas,
    canChooseBranch,
    currentBranchAreaId,
    currentBranchAreaName,
    canEditMinimumCharge,
}) {
    const [minimumChargeUnlocked, setMinimumChargeUnlocked] = useState(false);

    function unlockMinimumCharge() {
        if (window.confirm('أنت على وشك تعديل الحد الأدنى لهذا المشترك يدويًا. هل تريد المتابعة؟')) {
            setMinimumChargeUnlocked(true);
        }
    }
    const selectedBranch = canChooseBranch ? branches.find((branch) => String(branch.id) === String(data.branch_id)) : null;

    // The area whose sub-areas ("منطقة 2") are selectable, and its name for
    // the read-only display below: the Super Admin's chosen branch, or the
    // actor's own (fixed) branch for everyone else. A branch only ever has
    // one area, so there's nothing to actually pick here.
    const resolvedAreaId = canChooseBranch ? (selectedBranch?.area_id ?? '') : (currentBranchAreaId ?? '');
    const resolvedAreaName = canChooseBranch ? (selectedBranch?.area?.name ?? '') : (currentBranchAreaName ?? '');

    // Seeded from the already-assigned meter box's own sub-area, if any, so
    // editing a subscriber shows its meter box pre-selected instead of
    // hiding it behind an unmade sub-area choice.
    const [subAreaId, setSubAreaId] = useState(() => {
        const currentBox = meterBoxes.find((box) => String(box.id) === String(data.meter_box_id));
        return currentBox?.sub_area_id ? String(currentBox.sub_area_id) : '';
    });

    const subAreasInArea = resolvedAreaId ? subAreas.filter((subArea) => String(subArea.area_id) === String(resolvedAreaId)) : [];

    const meterBoxesInScope = meterBoxes.filter((box) => {
        if (canChooseBranch && String(box.branch_id) !== String(data.branch_id)) {
            return false;
        }

        return subAreaId ? String(box.sub_area_id) === String(subAreaId) : String(box.id) === String(data.meter_box_id);
    });

    const meterBoxOptions = meterBoxesInScope.map((box) => ({ value: box.id, label: `${box.box_number} — ${box.name}` }));

    const showMeterBoxField = Boolean(subAreaId) || Boolean(data.meter_box_id);

    const selectedTariff = tariffs.find((tariff) => String(tariff.id) === String(data.tariff_id));

    function onBranchChange(value) {
        setSubAreaId('');
        setData((current) => ({ ...current, branch_id: value, meter_box_id: '' }));
    }

    function onSubAreaChange(value) {
        setSubAreaId(value);
        setData('meter_box_id', '');
    }

    function onCircuitBreakerChange(value) {
        const match = circuitBreakers.find((circuitBreaker) => String(circuitBreaker.id) === value);
        setData((current) => ({
            ...current,
            circuit_breaker_id: value,
            minimum_charge: match ? Number(match.minimum_payment) : current.minimum_charge,
        }));
    }

    return (
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <Section title="بيانات المشترك" />

            <Field id="full_name" label="الاسم" required error={errors.full_name}>
                <TextInput className="block w-full" value={data.full_name} autoFocus onChange={(e) => setData('full_name', e.target.value)} />
            </Field>

            <Field id="national_id" label="رقم الهوية" required error={errors.national_id}>
                <TextInput
                    required
                    dir="ltr"
                    inputMode="numeric"
                    maxLength={9}
                    pattern="[0-9]{9}"
                    className="block w-full"
                    value={data.national_id ?? ''}
                    onChange={(event) => setData('national_id', event.target.value)}
                />
            </Field>

            <Field id="phone" label="رقم الجوال" required error={errors.phone}>
                <TextInput
                    required
                    type="tel"
                    dir="ltr"
                    inputMode="numeric"
                    maxLength={10}
                    pattern="05[69][0-9]{7}"
                    title="رقم الجوال يجب أن يتكون من 10 أرقام ويبدأ بـ 059 أو 056"
                    className="block w-full"
                    value={data.phone}
                    onChange={(e) => setData('phone', e.target.value)}
                />
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

            <Section title="نوع الاشتراك والقاطع" />

            <Field id="tariff_id" label="نوع الاشتراك" required error={errors.tariff_id}>
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

            <ReadOnlyField id="tariff_rate" label="سعر الكيلو (شيكل)" value={selectedTariff ? Number(selectedTariff.rate).toFixed(2) : '—'} dir="ltr" />

            <Field id="circuit_breaker_id" label="القاطع" error={errors.circuit_breaker_id}>
                <select
                    className="block w-full rounded-md border-gray-300 shadow-sm"
                    value={data.circuit_breaker_id}
                    onChange={(e) => onCircuitBreakerChange(e.target.value)}
                >
                    <option value="">---</option>
                    {circuitBreakers.map((circuitBreaker) => (
                        <option key={circuitBreaker.id} value={circuitBreaker.id}>
                            {circuitBreaker.ampere} أمبير
                        </option>
                    ))}
                </select>
            </Field>

            <div>
                <div className="flex items-center justify-between">
                    <InputLabel htmlFor="minimum_charge">
                        الحد الادنى (شيكل)
                        <span className="text-red-500"> *</span>
                    </InputLabel>
                    {canEditMinimumCharge && !minimumChargeUnlocked && (
                        <button
                            type="button"
                            onClick={unlockMinimumCharge}
                            className="text-xs font-semibold text-brand-600 hover:underline"
                        >
                            تعديل
                        </button>
                    )}
                </div>
                <div className="relative mt-1">
                    <TextInput
                        id="minimum_charge"
                        type="number"
                        step="0.01"
                        disabled={!canEditMinimumCharge || !minimumChargeUnlocked}
                        className={`block w-full disabled:opacity-100 ${!canEditMinimumCharge || !minimumChargeUnlocked ? 'bg-gray-50 pe-10 text-gray-600' : ''}`}
                        value={data.minimum_charge}
                        onChange={(e) => setData('minimum_charge', e.target.value)}
                    />
                    {(!canEditMinimumCharge || !minimumChargeUnlocked) && <FieldLock />}
                </div>
                <InputError message={errors.minimum_charge} className="mt-1" />
            </div>

            <Section title="الموقع والعداد" />

            {canChooseBranch && (
                <Field id="branch_id" label="الفرع" required error={errors.branch_id}>
                    {branches.length === 0 ? (
                        <p className="text-sm text-gray-500">لا توجد فروع بعد — أنشئ فرعًا أولاً.</p>
                    ) : (
                        <select
                            className="block w-full rounded-md border-gray-300 shadow-sm"
                            value={data.branch_id}
                            onChange={(e) => onBranchChange(e.target.value)}
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

            <ReadOnlyField
                id="branch_area"
                label="المنطقة"
                value={resolvedAreaName || (canChooseBranch ? 'اختر فرعًا أولاً لعرض منطقته.' : 'فرعك غير مرتبط بمنطقة بعد.')}
            />

            {Boolean(resolvedAreaId) && (
                <Field id="sub_area_id" label="منطقة 2" error={errors.sub_area_id}>
                    {subAreasInArea.length === 0 ? (
                        <p className="text-sm text-gray-500">لا توجد منطقة 2 في هذه المنطقة بعد.</p>
                    ) : (
                        <select
                            className="block w-full rounded-md border-gray-300 shadow-sm"
                            value={subAreaId}
                            onChange={(e) => onSubAreaChange(e.target.value)}
                        >
                            <option value="">— بلا منطقة 2 —</option>
                            {subAreasInArea.map((subArea) => (
                                <option key={subArea.id} value={subArea.id}>
                                    {subArea.name}
                                </option>
                            ))}
                        </select>
                    )}
                </Field>
            )}

            {showMeterBoxField && (
                <Field id="meter_box_id" label="رقم الطبلون" error={errors.meter_box_id}>
                    {meterBoxesInScope.length === 0 ? (
                        <p className="text-sm text-gray-500">لا توجد طبلونات في منطقة 2 هذه بعد.</p>
                    ) : (
                        <SearchableSelect
                            value={data.meter_box_id}
                            onChange={(value) => setData('meter_box_id', value)}
                            options={meterBoxOptions}
                            searchPlaceholder="بحث عن طبلون..."
                            emptyLabel="لا توجد طبلونات مطابقة"
                        />
                    )}
                </Field>
            )}

            <Section title="معلومات الاشتراك" />

            <Field id="initial_reading" label="القراءة السابقة (كيلوواط ساعة)" required error={errors.initial_reading}>
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

            <Field id="subscription_fee" label="رسوم الاشتراك (شيكل)" error={errors.subscription_fee}>
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

            <Section title="معلومات إضافية" />

            <Field id="address" label="العنوان" error={errors.address} span="sm:col-span-2 lg:col-span-3">
                <textarea
                    rows={2}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500"
                    value={data.address}
                    onChange={(e) => setData('address', e.target.value)}
                />
            </Field>

            <Field id="notes" label="معلومات أخرى" error={errors.notes} span="sm:col-span-2 lg:col-span-3">
                <textarea
                    rows={2}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500"
                    value={data.notes}
                    onChange={(e) => setData('notes', e.target.value)}
                />
            </Field>
        </div>
    );
}
