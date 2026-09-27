import { cloneElement, useState } from 'react';
import Affix from '@/Components/Affix';
import ChoiceChips from '@/Components/ChoiceChips';
import ConfirmDialog from '@/Components/ConfirmDialog';
import FormSection from '@/Components/Form/FormSection';
import Icon from '@/Components/Icon';
import InputError from '@/Components/InputError';
import InputLabel from '@/Components/InputLabel';
import SearchableSelect from '@/Components/SearchableSelect';
import TextInput from '@/Components/TextInput';
import { formatAmount } from '@/lib/currency';
import { initials } from '@/lib/format';

const STATUS_OPTIONS = [
    { value: 'active', label: 'نشط', dot: 'green' },
    { value: 'suspended', label: 'مفصول', dot: 'amber' },
    { value: 'disconnected', label: 'مقطوع', dot: 'gray' },
];

const STATUS_DOTS = {
    active: 'bg-emerald-500',
    suspended: 'bg-amber-500',
    disconnected: 'bg-gray-400',
};

/** The fields the server requires of every subscriber; a Super Admin also picks the branch. */
const REQUIRED_FIELDS = ['full_name', 'national_id', 'phone', 'status', 'tariff_id', 'minimum_charge', 'initial_reading'];

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
    const name = data.full_name.trim();
    const phone = String(data.phone ?? '').trim();

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
    clearErrors,
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
    const minimumChargeLocked = !canEditMinimumCharge || !minimumChargeUnlocked;

    const requiredFields = canChooseBranch ? [...REQUIRED_FIELDS, 'branch_id'] : REQUIRED_FIELDS;
    const filledRequiredFields = requiredFields.filter((field) => String(data[field] ?? '').trim() !== '').length;

    /** A choice made with a chip: no input event fires, so clear its error here. */
    function choose(field, value) {
        setData(field, value);
        clearErrors?.(field);
    }

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

            <FormSection icon="user" title="بيانات المشترك" description="الاسم والهوية ورقم الجوال">
                <Field id="full_name" label="الاسم" required error={errors.full_name}>
                    <TextInput
                        required
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
                        title="رقم الهوية يجب أن يتكون من 9 أرقام"
                        placeholder="9 أرقام"
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
                        placeholder="059XXXXXXX"
                        className="block w-full"
                        value={data.phone}
                        onChange={(e) => setData('phone', e.target.value)}
                    />
                </Field>

                <Field id="status" label="الحالة" required error={errors.status} span="sm:col-span-2 lg:col-span-3">
                    <ChoiceChips label="الحالة" value={data.status} onChange={(value) => choose('status', value)} options={STATUS_OPTIONS} />
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
            </FormSection>

            <FormSection icon="calendar" title="معلومات الاشتراك" description="القراءة التي يبدأ منها حسابه، ورسوم الاشتراك وتاريخه">
                <Field id="initial_reading" label="القراءة السابقة" required error={errors.initial_reading}>
                    <Affix unit="ك.و.س">
                        <TextInput
                            type="number"
                            required
                            min={0}
                            step="0.01"
                            className="block w-full"
                            value={data.initial_reading}
                            onChange={(event) => setData('initial_reading', event.target.value)}
                        />
                    </Affix>
                </Field>

                <Field id="subscription_fee" label="رسوم الاشتراك" error={errors.subscription_fee}>
                    <Affix unit="شيكل">
                        <TextInput
                            type="number"
                            step="0.01"
                            className="block w-full"
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
            </FormSection>

            <FormSection icon="note" title="معلومات إضافية" description="العنوان وأي ملاحظات عن المشترك">
                <Field id="address" label="العنوان" error={errors.address} span="sm:col-span-2 lg:col-span-3">
                    <textarea rows={2} className="block w-full" value={data.address} onChange={(e) => setData('address', e.target.value)} />
                </Field>

                <Field id="notes" label="معلومات أخرى" error={errors.notes} span="sm:col-span-2 lg:col-span-3">
                    <textarea rows={2} className="block w-full" value={data.notes} onChange={(e) => setData('notes', e.target.value)} />
                </Field>
            </FormSection>
        </div>
    );
}
