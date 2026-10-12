import { Link, useForm } from '@inertiajs/react';
import Icon from '@/Components/Icon';
import InputError from '@/Components/InputError';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import StatusPill from '@/Components/DataTable/StatusPill';
import { formatMoney } from '@/lib/format';

export const currencies = { ILS: 'شيكل', USD: 'دولار', JOD: 'دينار' };
export const boxTypes = { cash: 'الصندوق النقدي', bank_transfer: 'صندوق الحوالات البنكية', clearing: 'صندوق المقاصات' };
export const dateTime = (value) => value ? new Intl.DateTimeFormat('ar-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Gaza' }).format(new Date(value)) : '—';
const stages = { open: 'مفتوح', awaiting_branch: 'مغلق – بانتظار استلام الفرع', awaiting_confirmation: 'استُلم – أكّد التسليم', completed: 'مكتمل' };

export function BoxStage({ box }) {
    return <div className="flex flex-wrap gap-2"><StatusPill tone={box.stage === 'open' ? 'blue' : box.stage === 'completed' ? 'green' : 'amber'} label={stages[box.stage]} />{box.rejectedCount > 0 && <StatusPill tone="red" label={`حركات مرفوضة: ${box.rejectedCount}`} />}</div>;
}

export function boxAction(box) {
    return box.stage === 'awaiting_confirmation' ? 'confirm' : null;
}

export function actionLabel() {
    return 'تأكيد التسليم';
}

/** The currencies a box shows: shekels always, a foreign currency only when the box holds or was counted with some. */
function shownCurrencies(box) {
    return Object.keys(currencies).filter(
        (currency) => currency === 'ILS' || (box.type === 'cash' && [box.totals, box.expectedCounts, box.receivedCounts].some((amounts) => Number(amounts?.[currency] ?? 0) !== 0)),
    );
}

export function BoxTotals({ box }) {
    return <div className="flex flex-wrap gap-4 font-display text-sm text-gray-700">{shownCurrencies(box).map((currency) => <span key={currency}>{currencies[currency]}: <b dir="ltr">{formatMoney(box.totals?.[currency] ?? 0)}</b></span>)}</div>;
}

const decisionLabels = { accepted: ['قبله الفرع', 'green'], debt: ['سُجّل دينًا عليك', 'red'] };

/**
 * The branch's count of a received cash box against what its payments say
 * it held, with each difference and what the branch decided about it.
 */
export function CountSummary({ box }) {
    if (!box.receivedCounts) return null;

    return (
        <div className="mt-4 overflow-x-auto rounded-control border border-gray-100">
            <table className="w-full text-start text-xs">
                <thead className="bg-gray-50 text-gray-500">
                    <tr>{['العملة', 'المتوقع', 'عدّ الفرع', 'الفرق', 'القرار'].map((label) => <th key={label} className="whitespace-nowrap p-3 text-start">{label}</th>)}</tr>
                </thead>
                <tbody>
                    {shownCurrencies(box).map((currency) => {
                        const difference = Number(box.differences?.[currency] ?? 0);
                        const decision = difference !== 0 ? decisionLabels[box.decisions?.[currency]] : null;

                        return (
                            <tr key={currency} className="border-t border-gray-100 text-gray-700">
                                <td className="p-3">{currencies[currency]}</td>
                                <td dir="ltr" className="p-3 text-start font-display">{formatMoney(box.expectedCounts?.[currency] ?? 0)}</td>
                                <td dir="ltr" className="p-3 text-start font-display">{formatMoney(box.receivedCounts[currency] ?? 0)}</td>
                                <td className={`p-3 font-semibold ${difference < 0 ? 'text-red-600' : difference > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                                    {difference === 0 ? 'مطابق' : <>{difference < 0 ? 'عجز' : 'زيادة'} <bdi dir="ltr" className="font-display">{formatMoney(Math.abs(difference))}</bdi></>}
                                </td>
                                <td className="p-3">{decision ? <StatusPill tone={decision[1]} label={decision[0]} /> : '—'}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/**
 * The collector's one action on a box: confirming the handover after the
 * branch counted and received their cash box. Closing, counting and
 * receiving belong to the branch.
 */
export function CashBoxAction({ box, onClose, onSuccess }) {
    const form = useForm({ branch_id: box.branchId });
    const close = () => { if (!form.processing) onClose(); };

    function submit(event) {
        event.preventDefault();
        form.post(box.urls.confirm, { preserveScroll: true, onSuccess: () => { onSuccess?.(); onClose(); } });
    }

    return (
        <Modal show onClose={close} centered maxWidth="lg">
            <form onSubmit={submit} className="space-y-5 p-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">تأكيد تسليم صندوقي</h3>
                        <p dir="ltr" className="mt-1 text-start font-display text-xs text-gray-500">{box.number}</p>
                    </div>
                    <button type="button" onClick={close} disabled={form.processing} aria-label="إغلاق" className="rounded-control p-2 text-gray-500 hover:bg-gray-100"><Icon name="close" className="h-5 w-5" /></button>
                </div>
                <div>
                    <p className="text-sm leading-7 text-gray-600">عدّ الفرع الصندوق واستلمه بتاريخ {dateTime(box.receivedAt)}. راجع العدّ أدناه، ثم أكّد أنك سلّمت الصندوق.</p>
                    <CountSummary box={box} />
                    {box.reason && <p className="mt-3 text-sm text-gray-600">سبب الفرق: {box.reason}</p>}
                </div>
                <InputError message={form.errors.action ?? form.errors.branch_id} />
                <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
                    <SecondaryButton type="button" onClick={close} disabled={form.processing}>إلغاء</SecondaryButton>
                    <PrimaryButton type="submit" disabled={form.processing}>{form.processing ? 'جارٍ الحفظ…' : 'تأكيد التسليم'}</PrimaryButton>
                </div>
            </form>
        </Modal>
    );
}

export function BoxCard({ box, type }) {
    return <article className="flex flex-col gap-4 rounded-panel border border-gray-100 bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-gray-900">{boxTypes[type]}</h3><StatusPill tone={box ? 'blue' : 'gray'} label={box ? 'مفتوح' : 'لا حركات'} /></div>
        <BoxTotals box={box ?? { type, totals: {} }} />
        <p className="text-xs leading-6 text-gray-500">{box ? `${box.paymentCount} حركات · فُتح ${dateTime(box.openedAt)} · يغلقه الفرع عند العدّ أو عند القطع` : 'يُفتح تلقائيًا عند تسجيل أول حركة.'}</p>
        {box && <div className="mt-auto flex flex-wrap gap-2"><Link href={box.urls.show} prefetch className="inline-flex items-center rounded-control border border-gray-200 px-3 py-2 text-sm text-gray-700">عرض الحركات</Link></div>}
    </article>;
}

export default function CollectorCashBox({ cashBox }) {
    if (!cashBox?.started) return null;

    return <section className="mb-6 space-y-4" aria-label="صناديقي المفتوحة">
        <div className="grid gap-4 lg:grid-cols-3">{Object.keys(boxTypes).map((type) => <BoxCard key={type} type={type} box={cashBox.current[type]} />)}</div>
    </section>;
}

/** The shortfalls the branch recorded as the collector's debt, still unpaid. */
export function CollectorDebts({ debts }) {
    if (!debts?.length) return null;

    return (
        <section className="space-y-3 rounded-panel border border-red-500/20 bg-red-500/5 p-5" aria-labelledby="collector-debts">
            <div>
                <h3 id="collector-debts" className="font-bold text-gray-900">ديون عليك</h3>
                <p className="mt-1 text-xs leading-6 text-gray-500">عجز في صناديقك قرّر الفرع تسجيله عليك. تسدّده للفرع، وهو يسجّل ما يستلمه منك.</p>
            </div>
            <ul className="divide-y divide-red-500/10">
                {debts.map((debt) => (
                    <li key={debt.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                        <div className="space-y-1">
                            {debt.box ? <Link href={debt.box.url} prefetch dir="ltr" className="font-display text-xs text-brand-600">{debt.box.number}</Link> : <span className="text-gray-500">—</span>}
                            <p className="text-xs text-gray-500">سُجّل {dateTime(debt.createdAt)} · أصل الدين <bdi dir="ltr" className="font-display">{formatMoney(debt.amount)}</bdi> {currencies[debt.currency]}</p>
                        </div>
                        <p className="text-gray-600">المتبقي <b dir="ltr" className="font-display text-base text-red-600">{formatMoney(debt.remaining)}</b> {currencies[debt.currency]}</p>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function AuditNoteReply({ note, onSaved }) {
    const form = useForm({ body: '' });

    function submit(event) {
        event.preventDefault();
        form.post(note.replyUrl, { preserveScroll: true, onSuccess: () => onSaved?.() });
    }

    return (
        <form onSubmit={submit} className="space-y-2">
            <label htmlFor={`audit-note-${note.id}`} className="text-xs font-semibold text-gray-600">ردّك</label>
            <textarea
                id={`audit-note-${note.id}`}
                value={form.data.body}
                onChange={(event) => form.setData('body', event.target.value)}
                rows={3}
                maxLength={3000}
                required
                className="block w-full rounded-control border-gray-200 text-sm"
            />
            <InputError message={form.errors.body ?? form.errors.action} />
            <div className="flex justify-end">
                <PrimaryButton type="submit" disabled={form.processing || !form.data.body.trim()}>{form.processing ? 'جارٍ الإرسال…' : 'إرسال الرد'}</PrimaryButton>
            </div>
        </form>
    );
}

/** The audit notes the branch passed to the collector to answer. */
export function CollectorAuditNotes({ notes, onSaved }) {
    if (!notes?.length) return null;

    return (
        <section className="space-y-3 rounded-panel border border-amber-500/25 bg-amber-500/5 p-5" aria-labelledby="collector-audit-notes">
            <h3 id="collector-audit-notes" className="font-bold text-gray-900">ملاحظات تدقيق تنتظر ردّك</h3>
            {notes.map((note) => (
                <article key={note.id} className="space-y-3 border-t border-amber-500/15 pt-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        {note.box && <Link href={note.box.url} prefetch dir="ltr" className="font-display text-brand-600">{note.box.number}</Link>}
                        <span>أسبوع <bdi dir="ltr">{note.periodStart}</bdi> – <bdi dir="ltr">{note.periodEnd}</bdi></span>
                    </div>
                    <p className="text-sm leading-7 text-gray-800">{note.body}</p>
                    {note.question && <p className="rounded-control bg-surface p-3 text-sm leading-7 text-gray-700"><b className="text-gray-900">سؤال الفرع: </b>{note.question}</p>}
                    {note.differences && (
                        <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                            {Object.entries(note.differences).filter(([, amount]) => Number(amount) !== 0).map(([currency, amount]) => (
                                <span key={currency}>{Number(amount) < 0 ? 'عجز' : 'زيادة'} <bdi dir="ltr" className="font-display">{formatMoney(Math.abs(Number(amount)))}</bdi> {currencies[currency]}</span>
                            ))}
                        </div>
                    )}
                    <AuditNoteReply note={note} onSaved={onSaved} />
                </article>
            ))}
        </section>
    );
}

/** Everything waiting on the collector: boxes to confirm and audit notes to answer. */
export function pendingCount(cashBox) {
    return (cashBox?.needsAction?.length ?? 0) + (cashBox?.auditNotes?.length ?? 0);
}
