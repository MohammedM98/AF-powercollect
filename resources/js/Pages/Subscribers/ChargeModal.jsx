import { useId, useRef, useState } from 'react';
import ConfirmDialog from '@/Components/ConfirmDialog';
import InputError from '@/Components/InputError';
import Modal from '@/Components/Modal';
import { useResourceForm } from '@/hooks/useResourceForm';
import { describeBalance } from '@/lib/accountStatement';
import { formatMoney, normalizeDecimalInput } from '@/lib/format';
import { clearErrorOnInput, submitOnCtrlEnter, validateFormFields } from '@/lib/formValidation';
import {
    AmountBox,
    balanceAfterRow,
    balanceText,
    ChoiceTile,
    DoneScreen,
    FieldLabel,
    FieldWarning,
    FormFooter,
    FormHeader,
    QuickPick,
    SubscriberStrip,
    SummaryFigure,
    SummaryLedger,
    SummaryPanel,
} from './AccountFormParts';
import { CorrectionReasonFields, EMPTY_CORRECTION, OriginalLine } from './CorrectionFields';

/** How each type of charge looks in the form: its icon, a hint, quick amounts and an example note. */
const TYPE_LOOKS = {
    settlement: { icon: 'scale', hint: 'تصحيح فرق في الحساب', quick: [20, 50, 100], example: 'مثال: مقاصة فرق قراءة شهر 8' },
    penalty: { icon: 'warning', hint: 'مخالفة أو عبث بالعداد', quick: [50, 100, 200], example: 'اكتب سبب الغرامة، مثال: توصيل خط بدون عداد' },
    disconnection_fee: { icon: 'power', hint: 'قطع الكهرباء أو إعادتها', quick: [25, 50], example: 'مثال: فصل بسبب تراكم الدين' },
};

/** A charge above this many shekels asks the user to double-check it. */
const LARGE_CHARGE = 500;

const notesClass =
    'block min-h-[76px] w-full resize-y rounded-[14px] border-[1.5px] bg-surface px-4 py-3 text-base leading-relaxed text-gray-900 transition placeholder:text-gray-400 hover:border-gray-300 focus:border-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/10';

/**
 * Charge a subscriber by hand (تحميل): a مقاصة, a financial penalty (which
 * must say why) or a service disconnection fee (with its usual amount
 * suggested). A dark panel beside the form shows what it does to the
 * balance before saving; once saved, the window shows what was recorded.
 * Keys: Ctrl + Enter saves, 1 · 2 · 3 pick the type.
 *
 * With `correcting` (a statement line), it corrects that charge instead:
 * the form starts from it, `balance` leaves it out, and saving cancels it
 * and records this one in its place, with one of `correctionReasons`.
 */
export default function ChargeModal({ show, onClose, subscriber, balance, chargeTypes, correcting = null, correctionReasons = [] }) {
    const titleId = useId();
    const amountInput = useRef(null);
    const form = useResourceForm(
        correcting ? `/subscribers/${subscriber.id}/transactions` : `/subscribers/${subscriber.id}/charges`,
        correcting,
        correcting
            ? { type: correcting.recorded.type, amount: correcting.recorded.amount, notes: correcting.recorded.notes, ...EMPTY_CORRECTION }
            : { type: chargeTypes[0]?.value ?? '', amount: '', notes: '' },
    );
    const { data, setData, errors } = form;
    const [discarding, setDiscarding] = useState(false);
    const [receipt, setReceipt] = useState(null);

    const type = chargeTypes.find((option) => option.value === data.type) ?? chargeTypes[0];
    const look = TYPE_LOOKS[type?.value] ?? TYPE_LOOKS.settlement;
    const amount = Number(data.amount) > 0 ? Number(data.amount) : 0;
    const balanceAfter = amount > 0 ? Number(balance) + amount : null;
    const missingReason = Boolean(type?.needsReason && !data.notes.trim());

    function close() {
        setDiscarding(false);
        setReceipt(null);
        form.resetAndClearErrors();
        onClose();
    }

    function requestClose() {
        if (!receipt && form.isDirty) {
            setDiscarding(true);
        } else {
            close();
        }
    }

    /** Picks a type, filling in its usual amount when none is typed yet. */
    function chooseType(value) {
        const usual = chargeTypes.find((option) => option.value === value)?.usualAmount;

        setData((current) => ({ ...current, type: value, amount: current.amount === '' && usual ? String(usual) : current.amount }));
        form.clearErrors('type', 'notes');
    }

    function setAmount(value) {
        setData('amount', value);
        form.clearErrors('amount');
        amountInput.current?.focus();
    }

    /** 1 · 2 · 3 pick the type — unless a field is being typed in. */
    function onKeyDown(event) {
        submitOnCtrlEnter(event);

        const typing = event.target.matches('textarea, input:not([type=radio])');
        const index = Number(event.key) - 1;

        if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && chargeTypes[index]) {
            event.preventDefault();
            chooseType(chargeTypes[index].value);
        }
    }

    function submit(event) {
        event.preventDefault();

        if (!validateFormFields(event.currentTarget, form)) {
            return;
        }

        const recorded = { typeLabel: type.label, amount, notes: data.notes.trim(), balanceAfter };

        form.save({
            preserveScroll: true,
            onSuccess: () => {
                setReceipt(recorded);
                form.resetAndClearErrors();
            },
        });
    }

    return (
        <>
            <Modal show={show} onClose={requestClose} maxWidth="5xl">
                {receipt ? (
                    <DoneScreen
                        tone="red"
                        title={correcting ? 'عُدّل التحميل' : 'أُضيف التحميل'}
                        text={`${formatMoney(receipt.amount)} ₪ ${receipt.typeLabel} على حساب ${subscriber.fullName}.`}
                        rows={[
                            ['النوع', receipt.typeLabel],
                            ['المبلغ', `+${formatMoney(receipt.amount)} ₪`],
                            ['الرصيد بعد', balanceText(describeBalance(receipt.balanceAfter))],
                            ['ملاحظات', receipt.notes || '—'],
                        ]}
                        anotherLabel="تحميل آخر"
                        onAnother={correcting ? null : () => setReceipt(null)}
                        onDone={close}
                    />
                ) : (
                    <form
                        noValidate
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        onSubmit={submit}
                        onInput={(e) => clearErrorOnInput(e, form)}
                        onKeyDown={onKeyDown}
                        className="flex max-h-[calc(100dvh-6rem)] flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_minmax(0,1fr)_auto]"
                    >
                        <FormHeader
                            titleId={titleId}
                            icon={correcting ? 'pencil' : 'arrow-down-tray'}
                            tone="red"
                            title={correcting ? 'تعديل تحميل' : 'إضافة تحميل'}
                            subtitle={correcting ? 'صحّح التحميل؛ يبقى الأصلي في الكشف ملغى مع سبب التعديل.' : 'مبلغ يُضاف على حساب المشترك.'}
                            onClose={requestClose}
                        />

                        {/* On phones the fields and the summary scroll together; side by side they each scroll alone. */}
                        <div className="min-h-0 flex-1 overflow-y-auto lg:contents">
                            <div className="grid grid-cols-1 content-start gap-[22px] px-5 pb-3 pt-5 sm:px-6 lg:col-start-1 lg:row-start-2 lg:min-h-0 lg:overflow-y-auto">
                                <SubscriberStrip
                                    subscriber={subscriber}
                                    balance={balance}
                                    balanceLabel={correcting ? 'الرصيد بدون التحميل الأصلي' : 'الرصيد الحالي'}
                                />

                                {correcting && <OriginalLine entry={correcting} />}

                                <fieldset>
                                    <legend className="contents">
                                        <FieldLabel required hint="اختر بالأرقام 1 · 2 · 3">
                                            نوع التحميل
                                        </FieldLabel>
                                    </legend>
                                    <div className="grid gap-3 sm:grid-cols-3">
                                        {chargeTypes.map((option, index) => (
                                            <ChoiceTile
                                                key={option.value}
                                                name="type"
                                                value={option.value}
                                                checked={data.type === option.value}
                                                onChange={chooseType}
                                                icon={TYPE_LOOKS[option.value]?.icon ?? 'document-plus'}
                                                title={option.label}
                                                hint={TYPE_LOOKS[option.value]?.hint}
                                                tone="red"
                                                stacked
                                                shortcut={index + 1}
                                            />
                                        ))}
                                    </div>
                                    <InputError message={errors.type} className="mt-2" />
                                </fieldset>

                                <div>
                                    <FieldLabel htmlFor="amount" required hint="بالشيكل">
                                        المبلغ
                                    </FieldLabel>
                                    <AmountBox
                                        id="amount"
                                        inputRef={amountInput}
                                        value={data.amount}
                                        onChange={(e) => setData('amount', normalizeDecimalInput(e.target.value))}
                                        unit="₪"
                                        placeholder="0.00"
                                        label="مبلغ التحميل"
                                        autoFocus
                                        error={Boolean(errors.amount)}
                                    >
                                        {look.quick.map((quick) => (
                                            <QuickPick key={quick} onClick={() => setAmount(String(quick))}>
                                                {quick} ₪
                                            </QuickPick>
                                        ))}
                                        {type?.usualAmount && (
                                            <span className="ms-auto text-[13.5px] text-gray-500">
                                                المعتاد لهذا النوع <b className="font-display text-gray-900">{formatMoney(type.usualAmount)} ₪</b>
                                            </span>
                                        )}
                                    </AmountBox>
                                    <InputError message={errors.amount} className="mt-2" />
                                    {amount > LARGE_CHARGE && (
                                        <FieldWarning>مبلغ كبير. تأكد أنه صحيح قبل الحفظ، فهو يظهر في كشف حساب المشترك.</FieldWarning>
                                    )}
                                </div>

                                <div>
                                    <FieldLabel
                                        htmlFor="charge_notes"
                                        required={type?.needsReason}
                                        hint={type?.needsReason ? 'مطلوب — يظهر في كشف الحساب' : 'اختياري'}
                                    >
                                        {type?.needsReason ? 'سبب الغرامة' : 'ملاحظات'}
                                    </FieldLabel>
                                    <textarea
                                        id="charge_notes"
                                        name="notes"
                                        rows={2}
                                        required={type?.needsReason}
                                        maxLength={1000}
                                        placeholder={look.example}
                                        value={data.notes}
                                        onChange={(e) => setData('notes', e.target.value)}
                                        className={`${notesClass} ${missingReason && amount > 0 ? 'border-amber-500/60' : 'border-gray-200'}`}
                                    />
                                    <InputError message={errors.notes} className="mt-2" />
                                </div>

                                {correcting && <CorrectionReasonFields form={form} reasons={correctionReasons} />}
                            </div>

                            <SummaryPanel title="ملخص التحميل" tag={type?.label}>
                                <SummaryFigure label="مبلغ التحميل" value={`+${formatMoney(amount)}`} tone="red" />
                                <SummaryLedger
                                    rows={[
                                        [correcting ? 'الرصيد بدون الأصلي' : 'الرصيد الحالي', balanceText(describeBalance(balance))],
                                        [type?.label ?? 'تحميل', `+${formatMoney(amount)} ₪`, 'red'],
                                    ]}
                                    result={balanceAfterRow('الرصيد بعد التحميل', balanceAfter)}
                                />
                            </SummaryPanel>
                        </div>

                        <FormFooter
                            onCancel={requestClose}
                            tone="red"
                            disabled={amount <= 0 || missingReason}
                            processing={form.processing}
                            submitLabel={correcting ? 'حفظ التعديل' : amount > 0 ? `تحميل ${formatMoney(amount)} ₪ على الحساب` : 'إضافة التحميل'}
                            shortcuts="1 · 2 · 3 للنوع"
                        />
                    </form>
                )}
            </Modal>

            <ConfirmDialog
                show={show && discarding}
                onConfirm={close}
                onCancel={() => setDiscarding(false)}
                title="تجاهل التحميل؟"
                message="أدخلت بيانات لم تُحفظ بعد. إذا أغلقت النافذة الآن فستفقدها."
                confirmLabel="تجاهل التحميل"
                cancelLabel="البقاء ومتابعة الإدخال"
                icon="alert"
                tone="danger"
            />
        </>
    );
}
