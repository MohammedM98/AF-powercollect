import { useEffect, useId, useState } from 'react';
import Modal from '@/Components/Modal';
import Icon from '@/Components/Icon';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import { formatMoney } from '@/lib/format';
import { lastReadingBalanceChange, lastReadingNeedsUnusualConfirmation } from '@/lib/readings';

const shortDate = (date) => (date ? date.slice(5).split('-').reverse().join('/') : '');

/** One value as it was and as it becomes, the old one struck through when it changes. */
function Change({ before, after, unit = '', format = formatMoney }) {
    const changed = Number(before) !== Number(after);

    return (
        <span className="inline-flex flex-wrap items-baseline gap-1.5">
            {changed && <bdi dir="ltr" className="font-display text-gray-400 line-through">{format(before)}</bdi>}
            {changed && <span className="text-gray-400">←</span>}
            <bdi dir="ltr" className="font-display font-semibold text-gray-900">{format(after)}</bdi>
            {unit && <span className="text-gray-500">{unit}</span>}
        </span>
    );
}

/**
 * "Are you sure?" before an edited last reading is saved: for its week and
 * the week after it (which starts from it), the readings, consumption and
 * amount before and after, as the server works them out (the preview), and
 * what the edit does to the balance. Confirming saves the edit and approves
 * again at once whichever of the two was approved, last week first; a week
 * the edit makes unusual is confirmed here too.
 */
export default function LastReadingConfirmDialog({ show, preview, subscriptionName, saving = false, onConfirm, onCancel }) {
    const id = useId();
    const [confirmedUnusual, setConfirmedUnusual] = useState(false);
    const weeks = preview?.weeks ?? [];
    const approvesAgain = weeks.some((week) => week.isApproved);
    const needsUnusualConfirmation = lastReadingNeedsUnusualConfirmation(weeks);
    const balanceChange = lastReadingBalanceChange(weeks);

    useEffect(() => {
        setConfirmedUnusual(false);
    }, [preview]);

    return (
        <Modal show={show} onClose={saving ? undefined : onCancel} maxWidth="lg" centered>
            <div role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} className="flex max-h-[90vh] flex-col">
                <div className="flex items-start gap-4 px-7 pb-4 pt-7">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700">
                        <Icon name="alert" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 pt-0.5">
                        <h3 id={`${id}-title`} className="text-lg font-bold text-gray-900">تعديل القراءة السابقة لـ {subscriptionName}</h3>
                        {weeks[0] && (
                            <p className="mt-1 text-sm leading-6 text-gray-600">
                                من <bdi dir="ltr" className="font-display">{formatMoney(weeks[0].before.currentReading)}</bdi> إلى <bdi dir="ltr" className="font-display">{formatMoney(weeks[0].after.currentReading)}</bdi>.
                                {approvesAgain ? ' يُلغى المبلغ القديم بقيد عكسي، وتُعتمد القراءة المعتمدة منهما مباشرة بعد التأكيد، الأسبوع الماضي أولًا.' : ' القراءتان بانتظار الاعتماد، وتبقيان كذلك.'}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto px-7 pb-2">
                    {weeks.map((week, index) => (
                        <div key={week.id} className="rounded-xl border border-gray-200 px-4 py-3">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <b className="text-sm text-gray-900">
                                    {index === 0 ? 'الأسبوع الماضي' : 'هذا الأسبوع'} · <bdi dir="ltr">{shortDate(week.weekStart)} – {shortDate(week.weekEnd)}</bdi>
                                </b>
                                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${week.isApproved ? 'bg-emerald-500/10 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {week.isApproved ? 'معتمدة · تُعتمد من جديد' : 'بانتظار الاعتماد'}
                                </span>
                            </div>
                            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                                <dt className="text-gray-500">{index === 0 ? 'القراءة' : 'تبدأ من'}</dt>
                                <dd>{index === 0 ? <Change before={week.before.currentReading} after={week.after.currentReading} /> : <Change before={week.before.previousReading} after={week.after.previousReading} />}</dd>
                                <dt className="text-gray-500">الاستهلاك</dt>
                                <dd><Change before={week.before.consumption} after={week.after.consumption} unit="كيلو" /></dd>
                                <dt className="text-gray-500">المبلغ</dt>
                                <dd><Change before={week.before.amountDue} after={week.after.amountDue} unit="₪" /></dd>
                            </dl>
                            {week.unusual && (
                                <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
                                    <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    الاستهلاك بعد التعديل أعلى بكثير من المعتاد لهذا المشترك.
                                </p>
                            )}
                        </div>
                    ))}

                    {approvesAgain && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm">
                            <span className="text-gray-600">أثر التعديل على رصيد المشترك</span>
                            <b className="text-gray-900">
                                {balanceChange === 0 ? 'لا يتغير' : <>{balanceChange > 0 ? 'يزيد' : 'ينقص'} <bdi dir="ltr" className="font-display">{formatMoney(Math.abs(balanceChange))}</bdi> ₪</>}
                            </b>
                        </div>
                    )}

                    {needsUnusualConfirmation && (
                        <label className="flex items-start gap-3 rounded-xl border border-dashed border-amber-500/60 px-4 py-3 text-sm font-semibold text-amber-800">
                            <input type="checkbox" checked={confirmedUnusual} onChange={(event) => setConfirmedUnusual(event.target.checked)} className="mt-0.5 rounded border-gray-300 text-amber-600" />
                            أؤكد أن القراءة صحيحة رغم أن الاستهلاك أعلى بكثير من المعتاد.
                        </label>
                    )}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-7 py-4">
                    <SecondaryButton onClick={onCancel} disabled={saving}>تراجع عن التعديل</SecondaryButton>
                    <PrimaryButton type="button" onClick={() => onConfirm({ confirmUnusual: confirmedUnusual })} disabled={saving || (needsUnusualConfirmation && !confirmedUnusual)} autoFocus>
                        {saving ? 'جارٍ الحفظ…' : approvesAgain ? 'تأكيد واعتماد' : 'تأكيد'}
                    </PrimaryButton>
                </div>
            </div>
        </Modal>
    );
}
