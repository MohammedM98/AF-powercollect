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

const QUICK_AMOUNTS = [50, 100, 200];

/** A clearing above this many shekels asks the user to double-check it. */
const LARGE_CLEARING = 500;

const notesClass =
    'block min-h-[76px] w-full resize-y rounded-[14px] border-[1.5px] border-gray-200 bg-surface px-4 py-3 text-base leading-relaxed text-gray-900 transition placeholder:text-gray-400 hover:border-gray-300 focus:border-gray-900 focus:outline-none focus:ring-4 focus:ring-gray-900/10';

/**
 * Record a clearing (مقاصة): a service for a service. The subscriber gets
 * electricity and gives the company a service in return — the service's
 * value comes off what they owe, like a payment made in work instead of
 * money, and may leave them in credit. The service must be named; it shows
 * on the statement. A dark panel beside the form shows the balance it
 * leaves; once saved, the window shows what was recorded. Keys: Ctrl +
 * Enter saves.
 *
 * With `correcting` (a statement line), it corrects that clearing instead:
 * the form starts from it, `balance` leaves it out, and saving cancels it
 * and records this one in its place, with one of `correctionReasons`.
 */
export default function ClearingModal({ show, onClose, subscriber, balance, correcting = null, correctionReasons = [] }) {
    const titleId = useId();
    const amountInput = useRef(null);
    const form = useResourceForm(
        correcting ? `/subscribers/${subscriber.id}/transactions` : `/subscribers/${subscriber.id}/clearings`,
        correcting,
        correcting ? { amount: correcting.recorded.amount, notes: correcting.recorded.notes, ...EMPTY_CORRECTION } : { amount: '', notes: '' },
    );
    const { data, setData, errors } = form;
    const [discarding, setDiscarding] = useState(false);
    const [confirmingSave, setConfirmingSave] = useState(false);
    const [receipt, setReceipt] = useState(null);

    const owed = Math.max(Number(balance), 0);
    const amount = Number(data.amount) > 0 ? Number(data.amount) : 0;
    const balanceAfter = amount > 0 ? Number(balance) - amount : null;
    const missingService = !data.notes.trim();

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

    function setAmount(value) {
        setData('amount', value);
        form.clearErrors('amount');
        amountInput.current?.focus();
    }

    function submit(event) {
        event.preventDefault();

        if (!validateFormFields(event.currentTarget, form)) {
            return;
        }

        setConfirmingSave(true);
    }

    function save() {
        setConfirmingSave(false);

        const recorded = { amount, service: data.notes.trim(), balanceAfter };

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
                        tone={correcting ? 'amber' : 'green'}
                        title={correcting ? 'صُحّحت المقاصة' : 'سُجّلت المقاصة'}
                        text={`نزل ${formatMoney(receipt.amount)} ₪ من حساب ${subscriber.fullName} مقابل خدمته للشركة.`}
                        rows={[
                            ['الخدمة', receipt.service],
                            ['قيمة المقاصة', `−${formatMoney(receipt.amount)} ₪`],
                            ['الرصيد بعد', balanceText(describeBalance(receipt.balanceAfter))],
                        ]}
                        anotherLabel="مقاصة أخرى"
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
                        onKeyDown={submitOnCtrlEnter}
                        className="flex max-h-[calc(100dvh-6rem)] flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_minmax(0,1fr)_auto]"
                    >
                        <FormHeader
                            titleId={titleId}
                            icon={correcting ? 'repeat' : 'scale'}
                            tone={correcting ? 'amber' : 'green'}
                            title={correcting ? 'تصحيح مقاصة' : 'مقاصة'}
                            subtitle={
                                correcting
                                    ? 'صحّح المقاصة؛ تبقى الأصلية في الكشف ملغاة مع سبب التصحيح.'
                                    : 'خدمة مقابل خدمة: المشترك يأخذ الكهرباء ويقدّم للشركة خدمة، فتُنزَّل قيمتها من حسابه.'
                            }
                            onClose={requestClose}
                        />

                        {/* On phones the fields and the summary scroll together; side by side they each scroll alone. */}
                        <div className="min-h-0 flex-1 overflow-y-auto lg:contents">
                            <div className="grid grid-cols-1 content-start gap-[22px] px-5 pb-3 pt-5 sm:px-6 lg:col-start-1 lg:row-start-2 lg:min-h-0 lg:overflow-y-auto">
                                <SubscriberStrip
                                    subscriber={subscriber}
                                    balance={balance}
                                    balanceLabel={correcting ? 'الرصيد بدون المقاصة الأصلية' : 'الرصيد الحالي'}
                                />

                                {correcting && <OriginalLine entry={correcting} />}

                                <div>
                                    <FieldLabel htmlFor="clearing_service" required hint="مطلوب — تظهر في كشف الحساب">
                                        الخدمة التي قدّمها المشترك للشركة
                                    </FieldLabel>
                                    <textarea
                                        id="clearing_service"
                                        name="notes"
                                        rows={2}
                                        required
                                        autoFocus
                                        maxLength={1000}
                                        placeholder="مثال: صيانة المولد في شهر 9"
                                        value={data.notes}
                                        onChange={(e) => setData('notes', e.target.value)}
                                        className={notesClass}
                                    />
                                    <InputError message={errors.notes} className="mt-2" />
                                </div>

                                <div>
                                    <FieldLabel htmlFor="amount" required hint="بالشيكل">
                                        قيمة الخدمة
                                    </FieldLabel>
                                    <AmountBox
                                        id="amount"
                                        inputRef={amountInput}
                                        value={data.amount}
                                        onChange={(e) => setData('amount', normalizeDecimalInput(e.target.value))}
                                        unit="₪"
                                        placeholder="0.00"
                                        label="قيمة المقاصة"
                                        error={Boolean(errors.amount)}
                                    >
                                        {QUICK_AMOUNTS.map((quick) => (
                                            <QuickPick key={quick} onClick={() => setAmount(String(quick))}>
                                                {quick} ₪
                                            </QuickPick>
                                        ))}
                                        {owed > 0 && (
                                            <QuickPick tone="green" onClick={() => setAmount(String(owed))}>
                                                كل ما عليه
                                            </QuickPick>
                                        )}
                                    </AmountBox>
                                    <InputError message={errors.amount} className="mt-2" />
                                    {amount > LARGE_CLEARING && (
                                        <FieldWarning>مبلغ كبير. تأكد أنه صحيح قبل الحفظ، فهو يظهر في كشف حساب المشترك.</FieldWarning>
                                    )}
                                    {amount > owed && (
                                        <FieldWarning>
                                            قيمة الخدمة أكبر مما على المشترك، فيبقى له رصيد {formatMoney(amount - owed)} ₪ يُخصم من قراءاته القادمة.
                                        </FieldWarning>
                                    )}
                                </div>

                                {correcting && <CorrectionReasonFields form={form} reasons={correctionReasons} />}
                            </div>

                            <SummaryPanel title="ملخص المقاصة" tag="خدمة مقابل خدمة">
                                <SummaryFigure label="قيمة المقاصة" value={`−${formatMoney(amount)}`} tone="green" note={data.notes.trim() || null} />
                                <SummaryLedger
                                    rows={[
                                        [correcting ? 'الرصيد بدون الأصلية' : 'الرصيد الحالي', balanceText(describeBalance(balance))],
                                        ['مقاصة', `−${formatMoney(amount)} ₪`, 'green'],
                                    ]}
                                    result={balanceAfterRow('الرصيد بعد المقاصة', balanceAfter)}
                                />
                            </SummaryPanel>
                        </div>

                        <FormFooter
                            onCancel={requestClose}
                            tone={correcting ? 'amber' : 'green'}
                            disabled={amount <= 0 || missingService}
                            processing={form.processing}
                            submitLabel={correcting ? 'حفظ التصحيح' : amount > 0 ? `مقاصة ${formatMoney(amount)} ₪ من الحساب` : 'تسجيل المقاصة'}
                        />
                    </form>
                )}
            </Modal>

            <ConfirmDialog
                show={show && discarding}
                onConfirm={close}
                onCancel={() => setDiscarding(false)}
                title="تجاهل المقاصة؟"
                message="أدخلت بيانات لم تُحفظ بعد. إذا أغلقت النافذة الآن فستفقدها."
                confirmLabel="تجاهل المقاصة"
                cancelLabel="البقاء ومتابعة الإدخال"
                icon="alert"
                tone="danger"
            />

            <ConfirmDialog
                show={show && confirmingSave}
                onConfirm={save}
                onCancel={() => setConfirmingSave(false)}
                title={correcting ? 'تأكيد حفظ التصحيح؟' : 'تأكيد تسجيل المقاصة؟'}
                message={`${correcting ? 'ستُصحَّح المقاصة إلى' : 'سينزل'} ${formatMoney(amount)} ₪ من حساب ${subscriber.fullName}${correcting ? '' : ' مقابل خدمته للشركة'}. هل تريد المتابعة؟`}
                confirmLabel={correcting ? 'نعم، احفظ التصحيح' : 'نعم، سجّل المقاصة'}
                cancelLabel="رجوع للمراجعة"
                icon="check"
            />
        </>
    );
}
