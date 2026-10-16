import { useEffect, useId, useState } from 'react';
import Modal from '@/Components/Modal';
import Icon from '@/Components/Icon';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import InputError from '@/Components/InputError';
import { formatMoney } from '@/lib/format';
import { lastReadingBalanceChange, lastReadingNeedsUnusualConfirmation } from '@/lib/readings';

const shortDate = (date) => (date ? date.slice(5).split('-').reverse().join('/') : '');

/** One value as it was and as it becomes, the old one struck through when it changes. */
function Change({ before, after, unit = '' }) {
    const changed = Number(before) !== Number(after);

    return (
        <span className="inline-flex flex-wrap items-baseline gap-1.5">
            {changed && <bdi dir="ltr" className="font-display text-gray-400 line-through">{formatMoney(before)}</bdi>}
            {changed && <span className="text-gray-400">←</span>}
            <bdi dir="ltr" className="font-display font-semibold text-gray-900">{formatMoney(after)}</bdi>
            {unit && <span className="text-gray-500">{unit}</span>}
        </span>
    );
}

/** A week's approval state: approved weeks are approved again at once on confirming. */
function WeekStatus({ week }) {
    return (
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${week.isApproved ? 'bg-emerald-500/10 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
            {week.isApproved ? 'معتمدة · تُعتمد من جديد' : 'بانتظار الاعتماد'}
        </span>
    );
}

/** The week's consumption and amount, before and after, once it is worked out. */
function Charges({ week }) {
    return (
        <>
            <dt className="text-gray-500">الاستهلاك</dt>
            <dd><Change before={week.before.consumption} after={week.after.consumption} unit="كيلو" /></dd>
            <dt className="text-gray-500">المبلغ</dt>
            <dd><Change before={week.before.amountDue} after={week.after.amountDue} unit="₪" /></dd>
        </>
    );
}

function UnusualNote() {
    return (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
            <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            الاستهلاك بعد التعديل أعلى بكثير من المعتاد لهذا المشترك.
        </p>
    );
}

/**
 * "Are you sure?" before an edited last reading is saved (`editor` is
 * useLastReadingEdit). It shows last week's reading, consumption and amount
 * before and after, as the server works them out. When this week has been
 * entered, its reading is typed again here by hand, never kept at the
 * number it had (shown struck through for reference), and this week is
 * worked out from it as it is typed. Then it shows what the edit does to
 * the balance. Confirming saves both and approves again at once whichever
 * was approved, last week first; a week the edit makes unusual is confirmed
 * here too.
 */
export default function LastReadingConfirmDialog({ editor, subscriptionName }) {
    const id = useId();
    const [confirmedUnusual, setConfirmedUnusual] = useState(false);
    const weeks = editor.preview?.weeks ?? [];
    const [lastWeek, thisWeek] = weeks;
    const approvesAgain = weeks.some((week) => week.isApproved);
    const needsUnusualConfirmation = lastReadingNeedsUnusualConfirmation(weeks);
    const balanceChange = lastReadingBalanceChange(weeks);
    const thisWeekReady = !thisWeek || (editor.nextCurrent !== '' && thisWeek.after !== null && !editor.previewing && !editor.nextError);

    useEffect(() => {
        setConfirmedUnusual(false);
    }, [editor.preview]);

    return (
        <Modal show={editor.confirming} onClose={editor.saving ? undefined : editor.cancel} maxWidth="lg" centered>
            <div role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} className="flex max-h-[90vh] flex-col">
                <div className="flex items-start gap-4 px-7 pb-4 pt-7">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700">
                        <Icon name="alert" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 pt-0.5">
                        <h3 id={`${id}-title`} className="text-lg font-bold text-gray-900">تعديل القراءة السابقة لـ {subscriptionName}</h3>
                        {lastWeek && (
                            <p className="mt-1 text-sm leading-6 text-gray-600">
                                من <bdi dir="ltr" className="font-display">{formatMoney(lastWeek.before.currentReading)}</bdi> إلى <bdi dir="ltr" className="font-display">{formatMoney(lastWeek.after.currentReading)}</bdi>.
                                {thisWeek && ' أدخل قراءة هذا الأسبوع من جديد من العداد؛ تُحسب منها.'}
                                {approvesAgain && ' يُلغى المبلغ القديم بقيد عكسي، وتُعتمد المعتمدة منهما مباشرة بعد التأكيد، الأسبوع الماضي أولًا.'}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto px-7 pb-2">
                    {lastWeek && (
                        <div className="rounded-xl border border-gray-200 px-4 py-3">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <b className="text-sm text-gray-900">الأسبوع الماضي · <bdi dir="ltr">{shortDate(lastWeek.weekStart)} – {shortDate(lastWeek.weekEnd)}</bdi></b>
                                <WeekStatus week={lastWeek} />
                            </div>
                            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                                <dt className="text-gray-500">القراءة</dt>
                                <dd><Change before={lastWeek.before.currentReading} after={lastWeek.after.currentReading} /></dd>
                                <Charges week={lastWeek} />
                            </dl>
                            {lastWeek.unusual && <UnusualNote />}
                        </div>
                    )}

                    {thisWeek && (
                        <div className="rounded-xl border-2 border-brand-500/40 px-4 py-3">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <b className="text-sm text-gray-900">هذا الأسبوع · <bdi dir="ltr">{shortDate(thisWeek.weekStart)} – {shortDate(thisWeek.weekEnd)}</bdi></b>
                                <WeekStatus week={thisWeek} />
                            </div>
                            <label htmlFor={`${id}-next`} className="mb-1.5 block text-sm font-semibold text-gray-800">
                                القراءة الحالية — أدخلها من جديد
                                <span className="ms-1.5 text-xs font-normal text-gray-500">
                                    (المسجلة: <bdi dir="ltr" className="font-display line-through">{formatMoney(thisWeek.before.currentReading)}</bdi>)
                                </span>
                            </label>
                            <input
                                id={`${id}-next`}
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min={lastWeek?.after.currentReading}
                                dir="ltr"
                                autoFocus
                                value={editor.nextCurrent}
                                onChange={(event) => editor.setNextCurrent(event.target.value)}
                                disabled={editor.saving}
                                aria-invalid={Boolean(editor.nextError)}
                                className="block w-full font-display text-lg"
                                placeholder={`من ${formatMoney(lastWeek?.after.currentReading ?? 0)} فأعلى`}
                            />
                            <InputError message={editor.nextError} className="mt-1" />
                            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                                <dt className="text-gray-500">تبدأ من</dt>
                                <dd><Change before={thisWeek.before.previousReading} after={lastWeek.after.currentReading} /></dd>
                                {thisWeek.after && editor.nextCurrent !== '' && !editor.nextError ? (
                                    <Charges week={thisWeek} />
                                ) : (
                                    <>
                                        <dt className="text-gray-500">الاستهلاك</dt>
                                        <dd className="text-gray-400">{editor.previewing ? 'جارٍ الحساب…' : 'بعد إدخال القراءة'}</dd>
                                    </>
                                )}
                            </dl>
                            {thisWeek.unusual && editor.nextCurrent !== '' && <UnusualNote />}
                        </div>
                    )}

                    {approvesAgain && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm">
                            <span className="text-gray-600">أثر التعديل على رصيد المشترك</span>
                            <b className="text-gray-900">
                                {balanceChange === null || !thisWeekReady
                                    ? <span className="font-normal text-gray-400">بعد إدخال قراءة هذا الأسبوع</span>
                                    : balanceChange === 0
                                        ? 'لا يتغير'
                                        : <>{balanceChange > 0 ? 'يزيد' : 'ينقص'} <bdi dir="ltr" className="font-display">{formatMoney(Math.abs(balanceChange))}</bdi> ₪</>}
                            </b>
                        </div>
                    )}

                    {needsUnusualConfirmation && thisWeekReady && (
                        <label className="flex items-start gap-3 rounded-xl border border-dashed border-amber-500/60 px-4 py-3 text-sm font-semibold text-amber-800">
                            <input type="checkbox" checked={confirmedUnusual} onChange={(event) => setConfirmedUnusual(event.target.checked)} className="mt-0.5 rounded border-gray-300 text-amber-600" />
                            أؤكد أن القراءة صحيحة رغم أن الاستهلاك أعلى بكثير من المعتاد.
                        </label>
                    )}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-7 py-4">
                    <SecondaryButton onClick={editor.cancel} disabled={editor.saving}>تراجع عن التعديل</SecondaryButton>
                    <PrimaryButton
                        type="button"
                        onClick={() => editor.confirm({ confirmUnusual: confirmedUnusual })}
                        disabled={editor.saving || !thisWeekReady || (needsUnusualConfirmation && !confirmedUnusual)}
                    >
                        {editor.saving ? 'جارٍ الحفظ…' : approvesAgain ? 'تأكيد واعتماد' : 'تأكيد'}
                    </PrimaryButton>
                </div>
            </div>
        </Modal>
    );
}
