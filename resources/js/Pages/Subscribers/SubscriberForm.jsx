import { cloneElement, useEffect, useRef, useState } from 'react';
import Affix from '@/Components/Affix';
import ChoiceChips from '@/Components/ChoiceChips';
import ConfirmDialog from '@/Components/ConfirmDialog';
import FormSection from '@/Components/Form/FormSection';
import Icon from '@/Components/Icon';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import SearchableSelect from '@/Components/SearchableSelect';
import Switch from '@/Components/Switch';
import TextInput from '@/Components/TextInput';
import { formatAmount } from '@/lib/currency';
import { initials } from '@/lib/format';
import { plainDigits } from '@/lib/formValidation';

const STATUS_OPTIONS = [
    { value: 'active', label: 'نشط', dot: 'green' },
    { value: 'suspended', label: 'قيد الانتظار', dot: 'amber' },
    { value: 'disconnected', label: 'مفصول', dot: 'gray' },
];

const STATUS_DOTS = {
    active: 'bg-emerald-500',
    suspended: 'bg-amber-500',
    disconnected: 'bg-gray-400',
};

/**
 * The fields the server requires of every subscriber; a Super Admin also
 * picks the branch, and an active subscriber needs their starting reading.
 */
const REQUIRED_FIELDS = ['full_name', 'national_id', 'phone', 'status', 'tariff_id', 'minimum_charge'];

function Field({ id, label, required, error, hint, span = '', children }) {
    return (
        <div className={span}>
            <InputLabel htmlFor={id}>
                {label}
                {required && <span className="text-red-500"> *</span>}
            </InputLabel>
            <div className="mt-1">{cloneElement(children, { id, ...(hint ? { 'aria-describedby': `${id}-hint` } : {}) })}</div>
            {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-gray-500">{hint}</p>}
            <InputError message={error} className="mt-1" />
        </div>
    );
}

// A value the form shows but never lets the user edit directly (it's
// derived from another selection, like the branch's area).
function FieldLock() {
    return (
        <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-gray-400" aria-hidden="true">
            <Icon name="lock" className="h-4 w-4" />
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
 * The dark card at the top of the form: the subscriber as they're being
 * typed in (name, phone, status, subscription type and breaker), and how
 * many of the required fields are filled.
 */
function SubscriberPreview({ data, tariff, circuitBreaker, filled, total }) {
    const name = data.subscription_name.trim() || data.full_name.trim();
    const phone = String(data.subscription_phone || data.phone || '').trim();

    return (
        <div className="relative overflow-hidden rounded-card bg-graphite-gradient p-5 text-white shadow-lift sm:p-6">
            <div className="pointer-events-none absolute -end-12 -top-20 h-56 w-56 rounded-full bg-brand-500/25 blur-3xl" aria-hidden="true" />
            <div className="relative flex flex-wrap items-center justify-between gap-5">
                <div className="flex min-w-0 items-center gap-4">
                    <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-white/10 font-display text-lg font-bold ring-1 ring-white/15">
                        {name ? initials(name) : <Icon name="user" className="h-6 w-6 text-white/70" />}
                        <span
                            className={`absolute -bottom-0.5 -start-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-graphite-800 ${STATUS_DOTS[data.status]}`}
                            aria-hidden="true"
                        />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-xl font-bold">{name || 'مشترك جديد'}</p>
                        <p className="mt-0.5 font-display text-sm text-white/60" dir="ltr" style={{ textAlign: 'right' }}>
                            {phone || '05— ——— ——'}
                        </p>
                        {(tariff || circuitBreaker) && (
                            <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
                                {tariff && (
                                    <span className="rounded-full bg-white/10 px-2.5 py-0.5">
                                        {tariff.categoryLabel} · {formatAmount(tariff.rate)} ش/ك.و
                                    </span>
                                )}
                                {circuitBreaker && <span className="rounded-full bg-white/10 px-2.5 py-0.5">قاطع {circuitBreaker.ampere} أمبير</span>}
                            </div>
                        )}
                    </div>
                </div>

                <div className="w-44 shrink-0" aria-live="polite">
                    <div className="flex items-baseline justify-between gap-2 text-xs text-white/60">
                        <span>الحقول المطلوبة</span>
                        <b className="font-display text-base text-white" dir="ltr">
                            {filled}/{total}
                        </b>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                            className="h-full rounded-full bg-emerald-400 transition-[width] duration-300"
                            style={{ width: `${(filled / total) * 100}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * The form's starting values: the subscriber's own when editing,
 * otherwise blank. New subscribers start out waiting (قيد الانتظار).
 */
export function subscriberFormData(subscriber, sourceSubscriber = null) {
    const data = {
        full_name: subscriber?.full_name ?? '',
        subscription_name: subscriber?.subscription_name ?? subscriber?.full_name ?? '',
        national_id: subscriber?.national_id ?? '',
        phone: subscriber?.phone ?? '',
        subscription_phone: subscriber?.subscription_phone ?? subscriber?.phone ?? '',
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
        // New subscribers, and existing ones whose fee is not on the account yet, can be charged it.
        ...(subscriber?.subscription_fee_charged ? {} : { charge_subscription_fee: false }),
        subscription_date: subscriber?.subscription_date ?? '',
        // Only read by the form: it is not a field the server takes.
        has_been_active: subscriber?.has_been_active ?? false,
        notes: subscriber?.notes ?? '',
    };

    if (sourceSubscriber) {
        Object.assign(data, {
            source_subscriber_id: sourceSubscriber.id,
            full_name: sourceSubscriber.full_name,
            subscription_name: sourceSubscriber.display_name ?? sourceSubscriber.full_name,
            national_id: sourceSubscriber.national_id,
            phone: sourceSubscriber.phone ?? '',
            subscription_phone: sourceSubscriber.contact_phone ?? sourceSubscriber.phone ?? '',
            address: sourceSubscriber.address ?? '',
            branch_id: sourceSubscriber.branch_id,
        });
    }

    return data;
}

export default function SubscriberForm({
    data,
    setData,
    errors,
    clearErrors,
    meterBoxes,
    tariffs,
    circuitBreakers,
    branches,
    subAreas,
    canChooseBranch,
    currentBranchAreaId,
    canEditMinimumCharge,
    sharedPersonalDetails = false,
    isEdit = false,
    subscriptionCount = 1,
}) {
    // What the subscriber had when the form opened, which choosing the old status again brings back.
    const original = useRef(data).current;
    const independentContactDetails = sharedPersonalDetails || isEdit;
    const nameField = independentContactDetails ? 'subscription_name' : 'full_name';
    const phoneField = independentContactDetails ? 'subscription_phone' : 'phone';
    const [minimumChargeUnlocked, setMinimumChargeUnlocked] = useState(false);
    const [confirmingMinimumChargeUnlock, setConfirmingMinimumChargeUnlock] = useState(false);

    function unlockMinimumCharge() {
        setConfirmingMinimumChargeUnlock(false);
        setMinimumChargeUnlocked(true);
    }
    const selectedBranch = canChooseBranch ? branches.find((branch) => String(branch.id) === String(data.branch_id)) : null;

    // The branch's area scopes the selectable sub-areas ("منطقة 2"). A Super
    // Admin also sees the chosen branch's area as a read-only value; branch
    // staff do not need to see or choose the area already fixed by their branch.
    const resolvedAreaId = canChooseBranch ? (selectedBranch?.area_id ?? '') : (currentBranchAreaId ?? '');
    const resolvedAreaName = selectedBranch?.area?.name ?? '';

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

        return !subAreaId || String(box.sub_area_id) === String(subAreaId);
    });

    const meterBoxOptions = meterBoxesInScope.map((box) => ({ value: box.id, label: box.label ?? `${box.box_number} — ${box.name}` }));

    const showMeterBoxField = !canChooseBranch || Boolean(data.branch_id);

    useEffect(() => {
        if (!isEdit && !subAreaId && subAreasInArea.length === 1) {
            setSubAreaId(String(subAreasInArea[0].id));
        }
    }, [isEdit, resolvedAreaId, subAreaId, subAreasInArea]);

    const selectedTariff = tariffs.find((tariff) => String(tariff.id) === String(data.tariff_id));
    const selectedCircuitBreaker = circuitBreakers.find((circuitBreaker) => String(circuitBreaker.id) === String(data.circuit_breaker_id));
    const minimumChargeLocked = !canEditMinimumCharge || !minimumChargeUnlocked;
    const subscriptionFeeLocked = 'charge_subscription_fee' in data && !data.charge_subscription_fee;

    const contactRequiredFields = REQUIRED_FIELDS.map((field) => field === 'full_name' ? nameField : field === 'phone' ? phoneField : field);
    // Once active, a subscriber is disconnected rather than put back to waiting.
    const statusOptions = STATUS_OPTIONS.map((option) =>
        isEdit && (original.status === 'active' || original.has_been_active) && option.value === 'suspended'
            ? { ...option, disabled: true, title: 'لا يمكن إعادة مشترك سبق تفعيله إلى قيد الانتظار؛ غيّر حالته إلى مفصول.' }
            : option,
    );
    const readingRequired = data.status === 'active';
    const requiredFields = [...contactRequiredFields, ...(canChooseBranch ? ['branch_id'] : []), ...(readingRequired ? ['initial_reading'] : [])];
    const filledRequiredFields = requiredFields.filter((field) => String(data[field] ?? '').trim() !== '').length;

    /** A choice made with a chip: no input event fires, so clear its error here. */
    function choose(field, value) {
        setData(field, value);
        clearErrors?.(field);
    }

    /**
     * The starting reading is entered only for an active subscriber.
     * Activating one who is not active yet starts their subscription today,
     * from a reading entered now; choosing their old status again puts back
     * what they had.
     */
    function chooseStatus(value) {
        const activating = isEdit && original.status !== 'active' && value === 'active';

        setData((current) => ({
            ...current,
            status: value,
            initial_reading: value === 'active' ? (activating ? '' : current.initial_reading) : isEdit ? original.initial_reading : '',
            ...(isEdit && original.status !== 'active'
                ? { subscription_date: activating ? new Date().toLocaleDateString('en-CA') : original.subscription_date }
                : {}),
        }));
        clearErrors?.('status', 'initial_reading', 'subscription_date');
    }

    function onBranchChange(value) {
        setSubAreaId('');
        setData((current) => ({ ...current, branch_id: value, meter_box_id: '' }));
    }

    function onSubAreaChange(value) {
        setSubAreaId(value);
        const selectedBox = meterBoxes.find((box) => String(box.id) === String(data.meter_box_id));

        if (selectedBox && value && String(selectedBox.sub_area_id) !== String(value)) {
            setData('meter_box_id', '');
        }
    }

    function onMeterBoxChange(value) {
        const selectedBox = meterBoxes.find((box) => String(box.id) === String(value));

        setData('meter_box_id', value);

        if (selectedBox?.sub_area_id) {
            setSubAreaId(String(selectedBox.sub_area_id));
        }
    }

    // A segment belongs to one tariff, so picking another tariff clears it.
    function onTariffChange(value) {
        setData((current) => ({ ...current, tariff_id: value, tariff_segment_id: '' }));
        clearErrors?.('tariff_id');
    }

    function onCircuitBreakerChange(value) {
        const match = circuitBreakers.find((circuitBreaker) => String(circuitBreaker.id) === value);
        setData((current) => ({
            ...current,
            circuit_breaker_id: value,
            minimum_charge: match ? Number(match.minimum_payment) : current.minimum_charge,
        }));
        clearErrors?.('circuit_breaker_id');
    }

    return (
        <div className="space-y-4">
            <SubscriberPreview
                data={data}
                tariff={selectedTariff}
                circuitBreaker={selectedCircuitBreaker}
                filled={filledRequiredFields}
                total={requiredFields.length}
            />

            {(sharedPersonalDetails || subscriptionCount > 1) && (
                <div className="rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-800">
                    {sharedPersonalDetails
                        ? 'سيُضاف اشتراك جديد بنفس الهوية. يمكنك إضافة وصف إلى الاسم وتغيير رقم الجوال لهذا الاشتراك.'
                        : 'الاسم ورقم الجوال قابلان للتعديل لهذا الاشتراك فقط. الهوية والعنوان مشتركان بين الاشتراكات.'}
                    <InputError message={errors.source_subscriber_id} className="mt-1" />
                </div>
            )}

            <FormSection icon="user" title="بيانات المشترك" description="الاسم والهوية ورقم الجوال">
                <Field
                    id={nameField}
                    label="الاسم"
                    required
                    error={errors[nameField]}
                    hint={independentContactDetails ? 'يمكنك إضافة وصف إلى الاسم مثل: محمد حمدان — المنزل.' : undefined}
                >
                    <TextInput
                        required
                        className="block w-full"
                        placeholder="الاسم الرباعي"
                        maxLength={255}
                        value={data[nameField]}
                        autoFocus
                        onChange={(e) => setData(nameField, e.target.value)}
                    />
                </Field>

                <Field id="national_id" label="رقم الهوية" required error={errors.national_id}>
                    <TextInput
                        required
                        dir="ltr"
                        inputMode="numeric"
                        maxLength={9}
                        pattern="[0-9]{9}"
                        data-feedback
                        title="رقم الهوية يجب أن يتكون من 9 أرقام"
                        placeholder="9 أرقام"
                        className="block w-full"
                        value={data.national_id ?? ''}
                        readOnly={sharedPersonalDetails}
                        onChange={(event) => setData('national_id', plainDigits(event.target.value))}
                    />
                </Field>

                <Field id={phoneField} label="رقم الجوال" required error={errors[phoneField]}>
                    <TextInput
                        required
                        type="tel"
                        dir="ltr"
                        inputMode="numeric"
                        maxLength={10}
                        pattern="05[69][0-9]{7}"
                        data-feedback
                        title="رقم الجوال يجب أن يتكون من 10 أرقام ويبدأ بـ 059 أو 056"
                        placeholder="059XXXXXXX"
                        className="block w-full"
                        value={data[phoneField]}
                        onChange={(e) => setData(phoneField, plainDigits(e.target.value))}
                    />
                </Field>

                <Field
                    id="status"
                    label="الحالة"
                    required
                    error={errors.status}
                    span="sm:col-span-2 lg:col-span-3"
                    hint={
                        isEdit && original.status !== 'active' && data.status === 'active'
                            ? 'عند التفعيل أدخل القراءة السابقة للعدّاد، ويُحدَّث تاريخ الاشتراك إلى تاريخ اليوم.'
                            : undefined
                    }
                >
                    <ChoiceChips label="الحالة" value={data.status} onChange={chooseStatus} options={statusOptions} />
                </Field>
            </FormSection>

            <FormSection icon="bolt" title="نوع الاشتراك والقاطع" description="سعر الكيلو والحد الأدنى يُحسبان تلقائيًا من اختيارك">
                <Field id="tariff_id" label="نوع الاشتراك" required error={errors.tariff_id} span="sm:col-span-2">
                    <ChoiceChips
                        label="نوع الاشتراك"
                        name="tariff_id"
                        required
                        value={data.tariff_id}
                        onChange={onTariffChange}
                        options={tariffs.map((tariff) => ({
                            value: tariff.id,
                            label: tariff.categoryLabel,
                            hint: `${formatAmount(tariff.rate)} ش/ك.و`,
                        }))}
                    />
                </Field>

                <div>
                    <InputLabel htmlFor="tariff_rate" value="سعر الكيلو" />
                    <div className="mt-1">
                        <Affix unit="شيكل">
                            <TextInput
                                id="tariff_rate"
                                readOnly
                                title="للقراءة فقط"
                                value={selectedTariff ? formatAmount(selectedTariff.rate) : '—'}
                                className="block w-full text-gray-600"
                            />
                        </Affix>
                    </div>
                </div>

                {(selectedTariff?.segments ?? []).length > 0 && (
                    <Field id="tariff_segment_id" label="تصنيف الزبائن" error={errors.tariff_segment_id}>
                        <select
                            className="block w-full"
                            value={data.tariff_segment_id}
                            onChange={(e) => setData('tariff_segment_id', e.target.value)}
                        >
                            <option value="">{selectedTariff.categoryLabel} — بدون تصنيف</option>
                            {selectedTariff.segments.map((segment) => (
                                <option key={segment.id} value={segment.id}>
                                    {segment.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                )}

                <Field id="circuit_breaker_id" label="القاطع" error={errors.circuit_breaker_id} span="sm:col-span-2">
                    <ChoiceChips
                        label="القاطع"
                        value={data.circuit_breaker_id}
                        onChange={onCircuitBreakerChange}
                        options={[
                            { value: '', label: 'بدون' },
                            ...circuitBreakers.map((circuitBreaker) => ({ value: circuitBreaker.id, label: `${circuitBreaker.ampere} أمبير` })),
                        ]}
                    />
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
                                className="text-xs font-semibold text-brand-600 hover:underline"
                            >
                                تعديل يدوي
                            </button>
                        )}
                    </div>
                    <div className="mt-1">
                        <Affix unit="شيكل">
                            <TextInput
                                id="minimum_charge"
                                type="number"
                                step="0.01"
                                disabled={minimumChargeLocked}
                                className={`block w-full disabled:opacity-100 ${minimumChargeLocked ? 'bg-gray-50 text-gray-600' : ''}`}
                                value={data.minimum_charge}
                                onChange={(e) => setData('minimum_charge', e.target.value)}
                            />
                        </Affix>
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
            </FormSection>

            <FormSection icon="pin" title="الموقع والعداد" description="الفرع ومنطقته والطبلون الذي يتغذّى منه">
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:col-span-2 sm:grid-cols-2 lg:col-span-3">
                    {canChooseBranch && (
                        <Field id="branch_id" label="الفرع" required error={errors.branch_id}>
                            {branches.length === 0 ? (
                                <p className="text-sm text-gray-500">لا توجد فروع بعد — أنشئ فرعًا أولاً.</p>
                            ) : (
                                <select required className="block w-full" value={data.branch_id} onChange={(e) => onBranchChange(e.target.value)}>
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

                    {canChooseBranch && (
                        <ReadOnlyField
                            id="branch_area"
                            label="المنطقة"
                            value={resolvedAreaName || 'اختر فرعًا أولاً لعرض منطقته.'}
                        />
                    )}

                    {Boolean(resolvedAreaId) && (
                        <Field id="sub_area_id" label="منطقة 2" error={errors.sub_area_id}>
                            {subAreasInArea.length === 0 ? (
                                <p className="text-sm text-gray-500">لا توجد منطقة 2 في هذه المنطقة بعد.</p>
                            ) : (
                                <select className="block w-full" value={subAreaId} onChange={(e) => onSubAreaChange(e.target.value)}>
                                    <option value="">{isEdit ? '— بلا منطقة 2 —' : '— اختر منطقة 2 —'}</option>
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
                                <p className="text-sm text-gray-500">لا توجد طبلونات في النطاق المحدد بعد.</p>
                            ) : (
                                <SearchableSelect
                                    value={data.meter_box_id}
                                    onChange={onMeterBoxChange}
                                    options={meterBoxOptions}
                                    searchPlaceholder="بحث عن طبلون..."
                                    emptyLabel="لا توجد طبلونات مطابقة"
                                />
                            )}
                        </Field>
                    )}
                </div>
            </FormSection>

            <FormSection icon="calendar" title="معلومات الاشتراك" description="القراءة التي يبدأ منها حسابه، ورسوم الاشتراك وتاريخه">
                <Field
                    id="initial_reading"
                    label="القراءة السابقة"
                    required={readingRequired}
                    error={errors.initial_reading}
                    hint={readingRequired ? 'منها يبدأ حساب الاستهلاك.' : 'تُدخل القراءة عند تفعيل المشترك، منها يبدأ حساب استهلاكه.'}
                >
                    <Affix unit="ك.و.س">
                        <TextInput
                            type="number"
                            required={readingRequired}
                            disabled={!readingRequired}
                            min={0}
                            step="0.01"
                            className={`block w-full disabled:opacity-100 ${readingRequired ? '' : 'bg-gray-50 text-gray-600'}`}
                            value={data.initial_reading}
                            onChange={(event) => setData('initial_reading', event.target.value)}
                        />
                    </Affix>
                </Field>

                <Field id="subscription_fee" label="رسوم الاشتراك" required={data.charge_subscription_fee} error={errors.subscription_fee}>
                    <Affix unit="شيكل">
                        <TextInput
                            type="number"
                            step="0.01"
                            disabled={subscriptionFeeLocked}
                            title={subscriptionFeeLocked ? 'فعّل تحميل رسوم اشتراك لإدخال المبلغ' : undefined}
                            className={`block w-full disabled:opacity-100 ${subscriptionFeeLocked ? 'bg-gray-50 text-gray-600' : ''}`}
                            required={data.charge_subscription_fee}
                            min={data.charge_subscription_fee ? '0.01' : '0'}
                            value={data.subscription_fee}
                            onChange={(e) => setData('subscription_fee', e.target.value)}
                        />
                    </Affix>
                </Field>

                <Field id="subscription_date" label="تاريخ الاشتراك" error={errors.subscription_date}>
                    <TextInput
                        type="date"
                        className="block w-full"
                        value={data.subscription_date}
                        onChange={(e) => setData('subscription_date', e.target.value)}
                    />
                </Field>

                {'charge_subscription_fee' in data && (
                    <div className="sm:col-span-2 lg:col-span-3">
                        <Switch
                            checked={data.charge_subscription_fee}
                            onChange={(checked) => choose('charge_subscription_fee', checked)}
                            label="تحميل رسوم اشتراك"
                            ariaLabel="تحميل رسوم اشتراك"
                        />
                        <p className="mt-2 text-sm text-gray-500">
                            {data.charge_subscription_fee
                                ? 'تُضاف رسوم الاشتراك إلى الرصيد وسجل المعاملات عند حفظ المشترك.'
                                : 'لن تُضاف الرسوم إلى الرصيد أو سجل المعاملات. يمكنك تحميلها لاحقًا من سجل المعاملات.'}
                        </p>
                        <InputError message={errors.charge_subscription_fee} className="mt-1" />
                    </div>
                )}
            </FormSection>

            <FormSection icon="note" title="معلومات إضافية" description="العنوان وأي ملاحظات عن المشترك">
                <Field id="address" label="العنوان" error={errors.address} span="sm:col-span-2 lg:col-span-3">
                    <textarea
                        rows={2}
                        className="block w-full"
                        value={data.address}
                        readOnly={sharedPersonalDetails}
                        onChange={(e) => setData('address', e.target.value)}
                    />
                </Field>

                <Field id="notes" label="معلومات أخرى" error={errors.notes} span="sm:col-span-2 lg:col-span-3">
                    <textarea rows={2} className="block w-full" value={data.notes} onChange={(e) => setData('notes', e.target.value)} />
                </Field>
            </FormSection>
        </div>
    );
}
