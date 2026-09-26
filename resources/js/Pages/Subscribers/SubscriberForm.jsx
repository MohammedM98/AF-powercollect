import { cloneElement, useState } from 'react';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';
import SearchableSelect from '@/Components/SearchableSelect';
import ConfirmDialog from '@/Components/ConfirmDialog';
import ChoiceChips from '@/Components/ChoiceChips';
import Icon from '@/Components/Icon';
import { SUBSCRIBER_STATUS_TONES, TONE_DOT_CLASSES } from '@/lib/subscriberStatus';

const STATUS_OPTIONS = [
    { value: 'active', label: 'نشط', dot: 'green' },
    { value: 'suspended', label: 'مفصول', dot: 'amber' },
    { value: 'disconnected', label: 'مقطوع', dot: 'red' },
];

/** One group of fields in its own card, with an icon, a title and a hint. */
function Section({ icon, title, description, children }) {
    return (
        <section className="rounded-card border border-gray-100 bg-surface p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-gray-600">
                    <Icon name={icon} className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                    <h4 className="font-bold text-gray-900">{title}</h4>
                    {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
                </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
        </section>
    );
}

/** A unit inside the end of a field, like "شيكل" on a money field or "ك.و.س" on a meter reading. */
function Affix({ children }) {
    return (
        <span className="pointer-events-none absolute inset-y-1.5 end-1.5 flex items-center rounded-lg bg-gray-100 px-2.5 text-xs font-semibold text-gray-500">
            {children}
        </span>
    );
}

/**
 * The dark card above the form: who is being registered — name, phone,
 * subscription type and circuit breaker, with a status dot, filled in as
 * they are typed or picked — and how many required fields are done.
 */
function SummaryCard({ data, requiredFields, isEdit, tariffLabel, circuitBreakerLabel }) {
    const filled = requiredFields.filter((field) => String(data[field] ?? '').trim() !== '').length;
    const percent = Math.round((filled / requiredFields.length) * 100);
    const chips = [tariffLabel && { icon: 'bolt', label: tariffLabel }, circuitBreakerLabel && { icon: 'shield', label: circuitBreakerLabel }].filter(
        Boolean,
    );

    return (
        <div className="relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-card bg-graphite-gradient p-5 text-white shadow-card dark:ring-1 dark:ring-white/10">
            <div className="pointer-events-none absolute -start-10 -top-16 h-44 w-72 rounded-full bg-brand-500/25 blur-3xl" aria-hidden="true" />
            <div className="relative flex min-w-0 items-center gap-4">
                <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-[#c9ced6]">
                    <Icon name="user" className="h-6 w-6" />
                    <span
                        className={`absolute -bottom-1 -start-1 h-4 w-4 rounded-full border-[3px] border-graphite-800 ${TONE_DOT_CLASSES[SUBSCRIBER_STATUS_TONES[data.status]] ?? 'bg-gray-400'}`}
                        aria-hidden="true"
                    />
                </span>
                <div className="min-w-0">
                    <p className="truncate text-lg font-bold text-white">{data.full_name.trim() || (isEdit ? '—' : 'مشترك جديد')}</p>
                    <p className="mt-0.5 font-display text-sm tracking-wider text-[#9aa3ae]" dir="ltr">
                        {data.phone || '05— ——— ———'}
                    </p>
                    {chips.length > 0 && (
                        <p className="mt-2 flex flex-wrap gap-1.5">
                            {chips.map((chip) => (
                                <span
                                    key={chip.icon}
                                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-[#c9ced6]"
                                >
                                    <Icon name={chip.icon} className="h-3.5 w-3.5" />
                                    {chip.label}
                                </span>
                            ))}
                        </p>
                    )}
                </div>
            </div>
            <div className="relative w-36">
                <p className="text-xs text-[#9aa3ae]">الحقول المطلوبة</p>
                <p className="mt-1 font-display text-lg font-bold text-white" dir="ltr">
                    {filled}/{requiredFields.length}
                </p>
                <div
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"
                    role="progressbar"
                    aria-label="الحقول المطلوبة المكتملة"
                    aria-valuenow={filled}
                    aria-valuemin={0}
                    aria-valuemax={requiredFields.length}
                >
                    <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${percent}%` }} />
                </div>
            </div>
        </div>
    );
}

/** A field with a unit inside its end; Field's `id` goes on to the input itself. */
function WithAffix({ id, affix, children }) {
    return (
        <div className="relative">
            {cloneElement(children, { id })}
            <Affix>{affix}</Affix>
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
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 10.5V6a4.5 4.5 0 0 0-9 0v4.5m-.75 0h10.5A2.25 2.25 0 0 1 19.5 12.75v6A2.25 2.25 0 0 1 17.25 21H6.75a2.25 2.25 0 0 1-2.25-2.25v-6a2.25 2.25 0 0 1 2.25-2.25Z"
                />
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
        tariff_segment_id: subscriber?.tariff_segment_id ?? '',
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
    isEdit = false,
}) {
    const [minimumChargeUnlocked, setMinimumChargeUnlocked] = useState(false);
    const [confirmingMinimumChargeUnlock, setConfirmingMinimumChargeUnlock] = useState(false);

    function unlockMinimumCharge() {
        setConfirmingMinimumChargeUnlock(false);
        setMinimumChargeUnlocked(true);
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
    const selectedCircuitBreaker = circuitBreakers.find((circuitBreaker) => String(circuitBreaker.id) === String(data.circuit_breaker_id));

    function onBranchChange(value) {
        setSubAreaId('');
        setData((current) => ({ ...current, branch_id: value, meter_box_id: '' }));
    }

    function onSubAreaChange(value) {
        setSubAreaId(value);
        setData('meter_box_id', '');
    }

    // A segment belongs to one tariff, so picking another tariff clears it.
    function onTariffChange(value) {
        setData((current) => ({ ...current, tariff_id: value, tariff_segment_id: '' }));
    }

    const requiredFields = [
        'full_name',
        'national_id',
        'phone',
        'status',
        'tariff_id',
        'minimum_charge',
        'initial_reading',
        ...(canChooseBranch ? ['branch_id'] : []),
    ];

    function onCircuitBreakerChange(value) {
        const match = circuitBreakers.find((circuitBreaker) => String(circuitBreaker.id) === value);
        setData((current) => ({
            ...current,
            circuit_breaker_id: value,
            minimum_charge: match ? Number(match.minimum_payment) : current.minimum_charge,
        }));
    }

    const tariffOptions = tariffs.map((tariff) => ({
        value: tariff.id,
        label: tariff.categoryLabel,
        hint: `${Number(tariff.rate).toFixed(2)} ش/ك.و`,
    }));

    const circuitBreakerOptions = [
        { value: '', label: 'بدون' },
        ...circuitBreakers.map((circuitBreaker) => ({ value: circuitBreaker.id, label: `${circuitBreaker.ampere} أمبير` })),
    ];

    const minimumChargeLocked = !canEditMinimumCharge || !minimumChargeUnlocked;

    return (
        <div className="space-y-5">
            <SummaryCard
                data={data}
                requiredFields={requiredFields}
                isEdit={isEdit}
                tariffLabel={selectedTariff?.categoryLabel}
                circuitBreakerLabel={selectedCircuitBreaker ? `${selectedCircuitBreaker.ampere} أمبير` : null}
            />

            <Section icon="user" title="بيانات المشترك" description="الاسم والهوية ورقم الجوال">
                <Field id="full_name" label="الاسم" required error={errors.full_name}>
                    <TextInput
                        className="block w-full"
                        placeholder="الاسم الرباعي"
                        value={data.full_name}
                        autoFocus
                        onChange={(e) => setData('full_name', e.target.value)}
                    />
                </Field>

                <Field id="national_id" label="رقم الهوية" required error={errors.national_id}>
                    <TextInput
                        required
                        dir="ltr"
                        inputMode="numeric"
                        maxLength={9}
                        pattern="[0-9]{9}"
                        placeholder="9 أرقام"
                        className="block w-full text-end"
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
                        placeholder="059XXXXXXX"
                        className="block w-full text-end"
                        value={data.phone}
                        onChange={(e) => setData('phone', e.target.value)}
                    />
                </Field>

                <Field id="status" label="الحالة" required error={errors.status} span="col-span-full">
                    <ChoiceChips label="الحالة" value={data.status} onChange={(value) => setData('status', value)} options={STATUS_OPTIONS} />
                </Field>
            </Section>

            <Section icon="bolt" title="نوع الاشتراك والقاطع" description="السعر والحد الأدنى يُحسبان تلقائيًا من اختيارك">
                <Field id="tariff_id" label="نوع الاشتراك" required error={errors.tariff_id} span="sm:col-span-2">
                    {tariffOptions.length === 0 ? (
                        <p className="text-sm text-gray-500">لا توجد تعرفات بعد — أضف تعرفة أولاً.</p>
                    ) : (
                        <ChoiceChips label="نوع الاشتراك" value={data.tariff_id} onChange={onTariffChange} options={tariffOptions} />
                    )}
                </Field>

                <div>
                    <InputLabel htmlFor="tariff_rate" value="سعر الكيلو" />
                    <div className="relative mt-1">
                        <TextInput
                            id="tariff_rate"
                            readOnly
                            dir="ltr"
                            title="للقراءة فقط"
                            value={selectedTariff ? Number(selectedTariff.rate).toFixed(2) : '—'}
                            className="w-full ps-16 text-end text-gray-600"
                        />
                        <Affix>شيكل</Affix>
                    </div>
                </div>

                {(selectedTariff?.segments ?? []).length > 0 && (
                    <Field id="tariff_segment_id" label="تصنيف الزبائن" error={errors.tariff_segment_id} span="sm:col-span-2 lg:col-span-3">
                        <select
                            className="block w-full"
                            value={data.tariff_segment_id}
                            onChange={(e) => setData('tariff_segment_id', e.target.value)}
                        >
                            <option value="">{`${selectedTariff.categoryLabel} — بدون تصنيف`}</option>
                            {selectedTariff.segments.map((segment) => (
                                <option key={segment.id} value={segment.id}>
                                    {segment.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                )}

                <Field id="circuit_breaker_id" label="القاطع" error={errors.circuit_breaker_id} span="sm:col-span-2">
                    <ChoiceChips label="القاطع" value={data.circuit_breaker_id} onChange={onCircuitBreakerChange} options={circuitBreakerOptions} />
                </Field>

                <div>
                    <div className="flex items-center justify-between">
                        <InputLabel htmlFor="minimum_charge">
                            الحد الأدنى
                            <span className="text-red-500"> *</span>
                        </InputLabel>
                        {canEditMinimumCharge && !minimumChargeUnlocked && (
                            <button
                                type="button"
                                onClick={() => setConfirmingMinimumChargeUnlock(true)}
                                className="text-xs font-semibold text-gray-500 transition hover:text-brand-600"
                            >
                                تعديل يدوي
                            </button>
                        )}
                    </div>
                    <div className="relative mt-1">
                        <TextInput
                            id="minimum_charge"
                            type="number"
                            step="0.01"
                            dir="ltr"
                            disabled={minimumChargeLocked}
                            className={`block w-full ps-16 text-end disabled:opacity-100 ${minimumChargeLocked ? 'text-gray-600' : ''}`}
                            value={data.minimum_charge}
                            onChange={(e) => setData('minimum_charge', e.target.value)}
                        />
                        <Affix>شيكل</Affix>
                    </div>
                    <InputError message={errors.minimum_charge} className="mt-1" />
                    <ConfirmDialog
                        show={confirmingMinimumChargeUnlock}
                        onConfirm={unlockMinimumCharge}
                        onCancel={() => setConfirmingMinimumChargeUnlock(false)}
                        title="تعديل الحد الأدنى يدويًا؟"
                        message="أنت على وشك تعديل الحد الأدنى لهذا المشترك يدويًا بدل القيمة المأخوذة من القاطع. هل تريد المتابعة؟"
                        confirmLabel="نعم، عدّل"
                        icon="alert"
                    />
                </div>
            </Section>

            <Section icon="pin" title="الموقع والعداد" description="الفرع ومنطقته والطبلون الذي يتبع له المشترك">
                {canChooseBranch && (
                    <Field id="branch_id" label="الفرع" required error={errors.branch_id}>
                        {branches.length === 0 ? (
                            <p className="text-sm text-gray-500">لا توجد فروع بعد — أنشئ فرعًا أولاً.</p>
                        ) : (
                            <select className="block w-full" value={data.branch_id} onChange={(e) => onBranchChange(e.target.value)}>
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
                            <select className="block w-full" value={subAreaId} onChange={(e) => onSubAreaChange(e.target.value)}>
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
            </Section>

            <Section icon="calendar" title="معلومات الاشتراك" description="القراءة الأولى للعداد والرسوم وتاريخ الاشتراك">
                <Field
                    id="initial_reading"
                    label={
                        <>
                            القراءة السابقة<span className="sr-only"> (كيلوواط ساعة)</span>
                        </>
                    }
                    required
                    error={errors.initial_reading}
                >
                    <WithAffix affix="ك.و.س">
                        <TextInput
                            type="number"
                            required
                            min={0}
                            step={1}
                            dir="ltr"
                            className="block w-full ps-16 text-end"
                            value={data.initial_reading}
                            onChange={(event) => setData('initial_reading', event.target.value)}
                        />
                    </WithAffix>
                </Field>

                <Field
                    id="subscription_fee"
                    label={
                        <>
                            رسوم الاشتراك<span className="sr-only"> (شيكل)</span>
                        </>
                    }
                    error={errors.subscription_fee}
                >
                    <WithAffix affix="شيكل">
                        <TextInput
                            type="number"
                            step="0.01"
                            dir="ltr"
                            className="block w-full ps-16 text-end"
                            value={data.subscription_fee}
                            onChange={(e) => setData('subscription_fee', e.target.value)}
                        />
                    </WithAffix>
                </Field>

                <Field id="subscription_date" label="تاريخ الاشتراك" error={errors.subscription_date}>
                    <TextInput
                        type="date"
                        className="block w-full"
                        value={data.subscription_date}
                        onChange={(e) => setData('subscription_date', e.target.value)}
                    />
                </Field>
            </Section>

            <Section icon="info" title="معلومات إضافية" description="العنوان وأي ملاحظات أخرى">
                <Field id="address" label="العنوان" error={errors.address} span="sm:col-span-2 lg:col-span-3">
                    <textarea rows={2} className="block w-full" value={data.address} onChange={(e) => setData('address', e.target.value)} />
                </Field>

                <Field id="notes" label="معلومات أخرى" error={errors.notes} span="sm:col-span-2 lg:col-span-3">
                    <textarea rows={2} className="block w-full" value={data.notes} onChange={(e) => setData('notes', e.target.value)} />
                </Field>
            </Section>
        </div>
    );
}
