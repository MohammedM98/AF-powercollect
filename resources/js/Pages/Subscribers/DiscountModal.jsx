import { useState } from 'react';
import { router } from '@inertiajs/react';
import ConfirmDialog from '@/Components/ConfirmDialog';
import FormModal from '@/Components/FormModal';
import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import InputError from '@/Components/InputError';
import { useResourceForm } from '@/hooks/useResourceForm';
import { describeBalance, discountAmount } from '@/lib/accountStatement';
import { formatAmount, formatCurrency } from '@/lib/currency';
import { weeklyCharges } from '@/lib/readings';
import { AccountHeader, BalanceAfter } from './AccountSummary';

/** A discount comes off the balance once, or off every weekly reading from now on. */
const KINDS = [
    { value: 'once', label: 'لمرة واحدة', hint: 'يُخصم الآن من الرصيد المستحق.' },
    { value: 'standing', label: 'دائم على كل قراءة', hint: 'ميزة للمشترك: يُخصم تلقائيًا من كل قراءة أسبوعية تُدخل من الآن حتى تُوقفه.' },
];

/**
 * What the value field asks for, by kind and method. `max` and `hint` get
 * `{ subscriber, owed, value }`; `tile` renames the method's choice.
 */
const METHOD_FIELDS = {
    once: {
        percentage: { label: 'النسبة (%)', max: () => '100', hint: ({ owed }) => `من الرصيد المستحق (${formatCurrency(owed)})` },
        kilowatt: { label: 'عدد الكيلوات', hint: ({ subscriber }) => `بسعر الكيلو للمشترك (${formatCurrency(subscriber.kiloPrice)})` },
        shekel: { label: 'المبلغ (شيكل)', hint: () => 'مبلغ ثابت يُخصم من الرصيد' },
    },
    standing: {
        percentage: { label: 'النسبة من كل قراءة (%)', max: () => '100', hint: () => 'من قيمة القراءة: الاستهلاك × سعر الكيلو' },
        kilowatt: { label: 'الكيلوات المخصومة من كل قراءة', hint: () => 'تُطرح من استهلاك الأسبوع، ويدفع ثمن الباقي فقط' },
        shekel: {
            label: 'الخصم من سعر الكيلو (شيكل)',
            tile: 'شيكل من سعر الكيلو',
            max: ({ subscriber }) => subscriber.kiloPrice,
            hint: ({ subscriber, value }) =>
                value > 0 && value <= Number(subscriber.kiloPrice)
                    ? `سعر الكيلو ${formatCurrency(subscriber.kiloPrice)} ← ${formatCurrency(Number(subscriber.kiloPrice) - value)} للمشترك`
                    : `سعر الكيلو للمشترك ${formatCurrency(subscriber.kiloPrice)}`,
        },
    },
};

/** How a standing discount reads: "10%", "3 كيلو" or "5 شيكل من سعر الكيلو". Mirrors StandingDiscount::termsFor(). */
function standingTerms(method, value) {
    const amount = formatAmount(value);

    return { percentage: `${amount}%`, kilowatt: `${amount} كيلو`, shekel: `${amount} شيكل من سعر الكيلو` }[method];
}

/** One choice of a row of radio tiles. */
function ChoiceTile({ name, value, checked, onChange, children }) {
    return (
        <label
            className={`flex min-h-11 cursor-pointer items-center justify-center rounded-control border px-2 py-1.5 text-center text-sm font-semibold leading-tight transition focus-within:ring-2 focus-within:ring-brand-500 ${
                checked ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
        >
            <input type="radio" name={name} value={value} checked={checked} onChange={(e) => onChange(e.target.value)} className="sr-only" />
            {children}
        </label>
    );
}

/**
 * Give a subscriber a discount (خصم). Once: taken off what they owe now —
 * a percentage of the balance, kilowatts at their kilo price, or shekels.
 * Standing: an advantage taken off every weekly reading recorded from now
 * on — a percentage of the reading, kilowatts off its consumption, or
 * shekels off the kilo price — until it is stopped. Shows before saving
 * the balance a discount leaves, or what the subscriber would pay for
 * their last week with a standing one.
 */
export default function DiscountModal({ show, onClose, subscriber, balance, discountMethods }) {
    const standingDiscount = subscriber.standingDiscount;
    const form = useResourceForm(`/subscribers/${subscriber.id}/discounts`, null, {
        kind: 'once',
        method: 'shekel',
        value: '',
        notes: '',
    });
    const { data, setData, errors } = form;
    const [confirmingStop, setConfirmingStop] = useState(false);
    const [stopping, setStopping] = useState(false);

    const isStanding = data.kind === 'standing';
    const value = Number(data.value);
    const owed = Math.max(Number(balance), 0);
    const field = METHOD_FIELDS[data.kind][data.method];
    const fieldContext = { subscriber, owed, value };

    // Once: what comes off the balance now.
    const discount = isStanding ? null : discountAmount(data.method, data.value, owed, subscriber.kiloPrice);
    const balanceAfter = discount === null ? null : describeBalance(Number(balance) - discount);

    // Standing: the subscriber's last week (or 10 kilos) billed without and with it.
    const hasLastReading = Number(subscriber.lastConsumption) > 0;
    const exampleKilos = hasLastReading ? Number(subscriber.lastConsumption) : 10;
    const exampleBill = weeklyCharges(exampleKilos, subscriber.kiloPrice, subscriber.minimumPayment);
    const exampleWithDiscount = isStanding && value > 0 ? weeklyCharges(exampleKilos, subscriber.kiloPrice, subscriber.minimumPayment, data) : null;

    let confirmMessage = null;

    if (isStanding && value > 0) {
        const terms = standingTerms(data.method, data.value);
        confirmMessage = standingDiscount
            ? `سيُستبدل الخصم الدائم لـ ${subscriber.fullName} (${standingDiscount.terms}) بخصم ${terms} على كل قراءة أسبوعية تُدخل من الآن. هل تريد المتابعة؟`
            : `سيحصل ${subscriber.fullName} على خصم دائم (${terms}) على كل قراءة أسبوعية تُدخل من الآن. هل تريد المتابعة؟`;
    } else if (discount !== null) {
        confirmMessage = `سيتم خصم ${formatAmount(discount)} شيكل من حساب ${subscriber.fullName}، ويصبح الرصيد ${
            balanceAfter.tone === 'settled' ? 'مسدّدًا' : `${balanceAfter.amount} شيكل ${balanceAfter.label}`
        }. هل تريد المتابعة؟`;
    }

    // A standing discount is saved on its own address; replacing one reads as an edit.
    const discountForm = {
        ...form,
        isEdit: isStanding && Boolean(standingDiscount),
        save: (options) => (isStanding ? form.put(`/subscribers/${subscriber.id}/standing-discount`, options) : form.save(options)),
    };

    function changeKind(kind) {
        // Switching to the standing kind starts from the subscriber's current one, to change it.
        const current = kind === 'standing' ? standingDiscount : null;

        setData((previous) => ({
            ...previous,
            kind,
            method: current?.method ?? previous.method,
            value: current ? formatAmount(current.value) : '',
            notes: current?.notes ?? '',
        }));
        form.clearErrors();
    }

    function changeMethod(method) {
        setData((current) => ({ ...current, method, value: '' }));
        form.clearErrors('value');
    }

    function stopStandingDiscount() {
        setConfirmingStop(false);
        router.delete(`/subscribers/${subscriber.id}/standing-discount`, {
            preserveScroll: true,
            onStart: () => setStopping(true),
            onFinish: () => setStopping(false),
            onSuccess: () => {
                form.resetAndClearErrors();
                onClose();
            },
        });
    }

    return (
        <>
            <FormModal
                show={show}
                onClose={onClose}
                form={discountForm}
                title="إضافة خصم"
                icon="dollar"
                maxWidth="2xl"
                bodyClassName="space-y-5"
                saveConfirmMessage={confirmMessage}
            >
                <AccountHeader subscriber={subscriber} balance={balance} />

                <fieldset>
                    <legend className="text-sm font-medium text-gray-700">نوع الخصم</legend>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                        {KINDS.map((kind) => (
                            <ChoiceTile key={kind.value} name="kind" value={kind.value} checked={data.kind === kind.value} onChange={changeKind}>
                                {kind.label}
                            </ChoiceTile>
                        ))}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{KINDS.find((kind) => kind.value === data.kind).hint}</p>
                </fieldset>

                {isStanding && standingDiscount && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm">
                        <div className="min-w-0">
                            <p className="font-semibold text-emerald-800 dark:text-emerald-300">الخصم الدائم الحالي: {standingDiscount.terms}</p>
                            <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                                منذ <bdi dir="ltr">{standingDiscount.grantedAt}</bdi>
                                {standingDiscount.grantedByName && ` · ${standingDiscount.grantedByName}`}
                                {standingDiscount.notes && ` · ${standingDiscount.notes}`}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setConfirmingStop(true)}
                            disabled={stopping}
                            className="shrink-0 text-sm font-semibold text-brand-600 hover:underline disabled:opacity-50"
                        >
                            {stopping ? 'جارٍ الإيقاف...' : 'إيقاف الخصم'}
                        </button>
                    </div>
                )}

                <fieldset>
                    <legend className="text-sm font-medium text-gray-700">طريقة الخصم</legend>
                    <div className="mt-1 grid grid-cols-3 gap-2">
                        {discountMethods.map((method) => (
                            <ChoiceTile
                                key={method.value}
                                name="method"
                                value={method.value}
                                checked={data.method === method.value}
                                onChange={changeMethod}
                            >
                                {METHOD_FIELDS[data.kind][method.value].tile ?? method.label}
                            </ChoiceTile>
                        ))}
                    </div>
                    <InputError message={errors.method} className="mt-2" />
                </fieldset>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <InputLabel htmlFor="discount_value" value={field.label} />
                        <TextInput
                            id="discount_value"
                            name="value"
                            type="number"
                            required
                            min="0.01"
                            max={field.max?.(fieldContext)}
                            step="0.01"
                            inputMode="decimal"
                            dir="ltr"
                            className="mt-1 w-full"
                            value={data.value}
                            autoFocus
                            onChange={(e) => setData('value', e.target.value)}
                        />
                        <p className="mt-1 text-xs text-gray-500">{field.hint(fieldContext)}</p>
                        <InputError message={errors.value} className="mt-2" />
                    </div>
                    {isStanding ? (
                        <div>
                            <InputLabel
                                value={
                                    hasLastReading ? `يدفع عن آخر قراءة (${formatAmount(exampleKilos)} كيلو)` : `يدفع عن ${exampleKilos} كيلو (مثال)`
                                }
                            />
                            <p className="mt-1 flex h-11 items-center gap-2 rounded-control bg-gray-50 px-3 text-sm tabular-nums">
                                {exampleWithDiscount ? (
                                    <>
                                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                            {formatCurrency(exampleWithDiscount.amountDue)}
                                        </span>
                                        {exampleWithDiscount.amountDue < exampleBill.amountDue && (
                                            <span className="text-gray-400 line-through">{formatCurrency(exampleBill.amountDue)}</span>
                                        )}
                                    </>
                                ) : (
                                    <span className="text-gray-500">{formatCurrency(exampleBill.amountDue)} بدون خصم</span>
                                )}
                            </p>
                            {exampleWithDiscount?.minimumApplies && (
                                <p className="mt-1 text-xs text-gray-500">
                                    لا يقل عن الحد الأدنى للأسبوع ({formatCurrency(subscriber.minimumPayment)}).
                                </p>
                            )}
                        </div>
                    ) : (
                        <div>
                            <InputLabel value="قيمة الخصم" />
                            <p className="mt-1 flex h-11 items-center rounded-control bg-gray-50 px-3 text-sm font-bold tabular-nums text-emerald-700">
                                {discount === null ? '—' : formatCurrency(discount)}
                            </p>
                        </div>
                    )}
                </div>

                <div>
                    <InputLabel
                        htmlFor="discount_notes"
                        value={isStanding ? 'سبب الخصم (يظهر مع الخصم الدائم)' : 'تفاصيل (تظهر في البيان بكشف الحساب)'}
                    />
                    <textarea
                        id="discount_notes"
                        name="notes"
                        rows={2}
                        className="mt-1 block w-full"
                        placeholder={isStanding ? 'مثال: مسجد، أو موظف في الشركة' : 'مثال: تعويض عن انقطاع الكهرباء'}
                        value={data.notes}
                        onChange={(e) => setData('notes', e.target.value)}
                    />
                    <InputError message={errors.notes} className="mt-2" />
                </div>

                {isStanding ? (
                    <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                        يُطبَّق على القراءات التي تُدخل من الآن، ويظهر في كشف الحساب حركة «خصم قراءة أسبوعية» بجانب كل قراءة معتمدة. القراءات المسجلة
                        قبل ذلك تبقى كما هي.
                    </p>
                ) : (
                    <BalanceAfter label="الرصيد بعد الخصم" balanceAfter={balanceAfter} placeholder="أدخل قيمة الخصم" />
                )}
            </FormModal>

            <ConfirmDialog
                show={show && confirmingStop}
                onConfirm={stopStandingDiscount}
                onCancel={() => setConfirmingStop(false)}
                title="إيقاف الخصم الدائم؟"
                message={`لن يُخصم (${standingDiscount?.terms}) من قراءات ${subscriber.fullName} التي تُدخل بعد الآن. القراءات المسجلة قبل ذلك تحتفظ بخصمها.`}
                confirmLabel="نعم، أوقف الخصم"
                cancelLabel="إبقاء الخصم"
                icon="alert"
                tone="danger"
            />
        </>
    );
}
