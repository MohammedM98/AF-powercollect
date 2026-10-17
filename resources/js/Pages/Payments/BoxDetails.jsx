import { useState } from 'react';
import { Link } from '@inertiajs/react';
import ConfirmDialog from '@/Components/ConfirmDialog';
import ActionsTh from '@/Components/DataTable/ActionsTh';
import ColumnWidths, { fixedTableStyle } from '@/Components/DataTable/ColumnWidths';
import StatusPill from '@/Components/DataTable/StatusPill';
import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import SegmentedTabs from '@/Components/SegmentedTabs';
import { formatMoney } from '@/lib/format';
import { boxTypes, currencies, dateTime, BoxTypeIcon } from './CollectorCashBox';
import { ledgerColumns, ledgerOf, ledgerTableClass, BoxNumberCell, LedgerLeadCells, LedgerTrailCells } from './LedgerColumns';
import BoxBreakdown, { breakdownEntry } from './BoxBreakdown';
import StatusGuide from './StatusGuide';
import { canAnswerBox, canSendBox } from './FinancialBoxComponents';
import { boxStatus, entryStatus, isFlaggedEntry } from '@/lib/financialBoxes';
import './financial-boxes.css';


/** A small action in an entry's row. */
const rowButton = 'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition hover:bg-gray-100';

const isActive = (entry) => !entry.transaction || entry.transaction.status === 'active';
const subscriberName = (entry) => entry.transaction?.subscription?.subscription_name || entry.transaction?.subscription?.full_name || '—';

/** Amounts added up by currency. */
function sumByCurrency(entries) {
    return Object.fromEntries(Object.keys(currencies).map((currency) => [currency, entries.filter((entry) => entry.currency === currency).reduce((sum, entry) => sum + Number(entry.amount), 0)]));
}

/** Amounts as one line, shekels always and another currency only when it has some. */
function amountsLine(amounts) {
    return Object.keys(currencies).filter((currency) => currency === 'ILS' || Number(amounts?.[currency] ?? 0) !== 0).map((currency) => `${formatMoney(amounts?.[currency] ?? 0)} ${currencies[currency]}`).join(' · ');
}

/** The foreign currencies among amounts, as one quiet line, or nothing when there are none. */
function otherCurrencies(amounts) {
    const lines = Object.keys(currencies).filter((currency) => currency !== 'ILS' && Number(amounts?.[currency] ?? 0) !== 0).map((currency) => `${formatMoney(amounts[currency])} ${currencies[currency]}`);

    return lines.length ? lines.join(' · ') : undefined;
}

/** One figure in the box's summary strip. */
function Stat({ icon, label, value, hint }) {
    return <div className="flex min-w-0 items-start gap-3 bg-surface p-3 sm:p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-gray-500"><Icon name={icon} className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0">
            <dt className="text-xs font-semibold text-gray-500">{label}</dt>
            <dd className="mt-1 font-display text-xl font-bold text-gray-900">{value}</dd>
            {hint && <dd className="mt-0.5 text-xs text-gray-500">{hint}</dd>}
        </div>
    </div>;
}

/** One step of a box's way to audit: when it happened and who did it, or that it has not yet. */
function JourneyStep({ icon, label, at, by, pending, children }) {
    return <li className={`flex min-w-0 items-start gap-2.5 rounded-control border p-3 ${at ? 'border-gray-100 bg-surface' : 'border-dashed border-gray-200'}`}>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${at ? 'bg-gray-900 text-surface' : 'bg-gray-100 text-gray-400'}`}><Icon name={icon} className="h-4 w-4" /></span>
        <span className="min-w-0 leading-5">
            <span className="block text-xs font-semibold text-gray-500">{label}</span>
            {at ? <><b className="block text-sm text-gray-900">{dateTime(at)}</b>{by && <span className="block truncate text-xs text-gray-600">{by}</span>}</> : <span className="block text-sm text-gray-500">{pending}</span>}
            {children}
        </span>
    </li>;
}

/** When the box was opened, closed, sent and audited, and by whom. */
function Journey({ box }) {
    const [auditLabel, auditTone] = box.sent_at ? boxStatus(box) : [];
    const audited = box.audit_status === 'approved' || box.audit_status === 'returned';

    return <ol aria-label="مسار الصندوق" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <JourneyStep icon="clock" label="فُتح" at={box.opened_at} by={box.user?.name} />
        <JourneyStep icon="lock" label="أُغلق" at={box.status === 'received' ? box.closedAt ?? box.closed_at : null} by={box.closedBy} pending={box.status === 'pending' ? 'ينتظر تأكيد الإغلاق' : 'لم يُغلق بعد'} />
        <JourneyStep icon="send" label="أُرسل إلى التدقيق" at={box.sent_at} by={box.sentBy} pending="لم يُرسل بعد">{box.send_note && <span className="mt-1 block text-xs text-gray-600">«{box.send_note}»</span>}</JourneyStep>
        <JourneyStep icon="shield" label="التدقيق" at={audited ? box.audited_at : null} by={box.auditedBy} pending={box.sent_at ? auditLabel : '—'}>{audited && <span className="mt-1 block"><StatusPill tone={auditTone} label={auditLabel} /></span>}</JourneyStep>
    </ol>;
}

/** The audit's notes on the box, each on the box or on one of its entries, with the branch's answers. */
function AuditNotes({ box, entries, answer }) {
    const [body, setBody] = useState('');
    const entryName = (id) => subscriberName(entries.find((entry) => entry.id === id) ?? {});

    return <section aria-labelledby="audit-notes" className="space-y-3 rounded-card border border-brand-500/25 bg-brand-500/[.04] p-4">
        <h3 id="audit-notes" className="flex items-center gap-2 text-sm font-bold text-gray-900"><Icon name="chat" className="h-4 w-4 text-brand-600" />ملاحظات التدقيق</h3>
        <ul className="space-y-2">{box.notes.map((note) => <li key={note.id} className="rounded-control bg-surface p-3 text-sm leading-6">
            <p className="text-xs text-gray-500">{note.entryId ? `على حركة ${entryName(note.entryId)}` : 'على الصندوق كله'} · {dateTime(note.createdAt)}{note.status === 'closed' ? ' · أُغلقت' : ''}</p>
            <p className="text-gray-800">{note.body}</p>
            {note.replies.map((reply) => <p key={reply.id} className="mt-2 border-s-2 border-gray-200 ps-3 text-gray-700"><b className="text-gray-900">{reply.user ?? 'الفرع'}:</b> {reply.body} <span className="text-xs text-gray-500">· {dateTime(reply.createdAt)}</span></p>)}
        </li>)}</ul>
        {answer && <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); if (body.trim()) answer(body.trim()); }}>
            <label className="block text-sm font-semibold text-gray-700" htmlFor="audit-answer">ردّ الفرع</label>
            <textarea id="audit-answer" value={body} onChange={(event) => setBody(event.target.value)} rows={2} maxLength={3000} required className="block w-full rounded-control border-gray-200 text-sm" placeholder="ما الذي صحّحته أو وضّحته؟" />
            <PrimaryButton type="submit" disabled={!body.trim()}><Icon name="send" className="h-4 w-4" />إرسال الرد وإعادة الصندوق إلى التدقيق</PrimaryButton>
        </form>}
    </section>;
}

/**
 * One box, large: who it belongs to, its totals, when it was opened, closed,
 * sent and audited and by whom, every entry in it as the subscriber's
 * statement shows it, and the audit's notes on it. The branch confirms an
 * open box closed from the footer once the collector has corrected
 * anything it raised with them, sends a closed box to audit, and answers
 * the audit's notes on a box sent back. The branch does not check transfers
 * or clearings one by one: the audit does. With `audit`, the auditor marks
 * the entries a note is about and approves the box (charging the branch a
 * debt for it if need be) or sends it back with a note.
 */
export default function BoxDetails({ box, onClose, perform, onSend, audit, branchName }) {
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [confirmingClose, setConfirmingClose] = useState(false);
    const [flagged, setFlagged] = useState(() => new Set());
    const type = box.type ?? 'cash';
    const cash = type === 'cash';
    const clearing = type === 'clearing';
    const entries = box.payments ?? [];
    const active = entries.filter(isActive);
    const totals = sumByCurrency(active);
    const editable = ['open', 'pending'].includes(box.status);
    const confirmable = !audit && box.canCount && ['open', 'pending'].includes(box.status);
    const auditing = audit && ['waiting', 'reviewing'].includes(box.audit_status);
    const [statusLabel, statusTone] = boxStatus(box);
    const counted = cash && box.head_counts && box.expected_counts && Object.keys(currencies).some((currency) => Number(box.head_counts[currency] ?? 0) !== Number(box.expected_counts[currency] ?? 0));
    const groups = {
        all: ['الكل', () => true],
        active: ['سارية', (entry) => isActive(entry) && !isFlaggedEntry(entry)],
        ...(cash ? {} : { rejected: [clearing ? 'مرفوضة' : 'غير موجودة في البنك', (entry) => isActive(entry) && isFlaggedEntry(entry)] }),
        cancelled: ['ملغاة', (entry) => !isActive(entry)],
    };
    const filterOptions = Object.entries(groups).map(([value, [label, matches]]) => ({ value, label: `${label} · ${entries.filter(matches).length}`, count: entries.filter(matches).length })).filter((option) => option.value === 'all' || option.count > 0);
    const query = search.trim();
    const shown = entries.filter(groups[filter]?.[1] ?? (() => true)).filter((entry) => !query || [subscriberName(entry), entry.transaction?.subscription?.account_number, entry.transaction?.manual_voucher_number, entry.transaction?.voucher_number, entry.transaction?.reference_number, entry.transaction?.notes].some((value) => String(value ?? '').includes(query)));
    const columns = [['الصندوق', 72], ...ledgerColumns.before, ['المشترك', 150], ...ledgerColumns.after, ['الحالة', 140], ['', auditing ? 150 : 110]];
    const toggleFlag = (id) => setFlagged((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
    const noted = new Set((box.notes ?? []).filter((note) => note.status !== 'closed' && note.entryId).map((note) => note.entryId));
    const widths = columns.map(([, width]) => width);

    return <Modal show onClose={onClose} maxWidth="full" centered panelClassName="financial-box-detail financial-surface flex flex-col">
        <header className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-gray-100 p-6">
            <div className="flex items-center gap-3">
                <BoxTypeIcon type={type} className="h-12 w-12" />
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">{boxTypes[type]} · صندوق <bdi dir="ltr" className="font-display">{box.number}</bdi></h2>
                    <p className="mt-1 text-sm text-gray-500">{branchName ? `${branchName} · ` : ''}{box.user?.name ?? '—'}</p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <StatusPill tone={statusTone} label={statusLabel} />
                <button type="button" onClick={onClose} aria-label="إغلاق النافذة" className="rounded-control p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"><Icon name="close" className="h-5 w-5" /></button>
            </div>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-gray-50/60 p-4 sm:p-6">
            <dl className="financial-box-detail-stats grid grid-cols-2 gap-px overflow-hidden rounded-card border border-gray-100 bg-gray-100 xl:grid-cols-4">
                <Stat icon="wallet" label="إجمالي الحركات السارية" value={<>{formatMoney(totals.ILS)} <span className="text-sm font-normal text-gray-500">شيكل</span></>} hint={otherCurrencies(totals)} />
                <Stat icon="list" label="الحركات" value={active.length.toLocaleString('en')} hint={entries.length > active.length ? `و${entries.length - active.length} ملغاة` : 'لا حركات ملغاة'} />
                <Stat icon={editable ? 'unlock' : 'lock'} label="تصحيح الحركات" value={<span className="text-base">{editable ? 'متاح للمحصّل' : 'مقفل'}</span>} hint={editable ? 'حتى تأكيد إغلاق الصندوق' : 'أُكّد إغلاق الصندوق'} />
                <Stat icon="calendar" label="فُتح ← أُغلق" value={<span className="text-sm">{dateTime(box.opened_at)}</span>} hint={box.closed_at ? dateTime(box.closed_at) : 'لا يزال مفتوحًا'} />
            </dl>

            <Journey box={box} />

            {Number(box.branch_debt ?? 0) > 0 && <p className="flex gap-2 rounded-control border border-brand-500/25 bg-brand-500/[.06] p-3 text-sm leading-6 text-gray-800"><Icon name="alert" className="h-5 w-5 shrink-0 text-brand-600" /><span><b className="text-brand-600">حمّل التدقيق على الفرع دينًا بـ{formatMoney(box.branch_debt)} شيكل</b>{box.branch_debt_reason ? `: ${box.branch_debt_reason}` : ''}</span></p>}

            {(box.notes?.length > 0) && <AuditNotes box={box} entries={entries} answer={!audit && canAnswerBox(box) ? (body) => perform('answer', box, { body }) : null} />}

            <BoxBreakdown type={type} entries={active.map(breakdownEntry)} />

            {confirmable && <p className="rounded-control bg-sky-500/10 px-4 py-3 text-sm leading-7 text-sky-700 dark:text-sky-400">اطّلع على حركات الصندوق ثم أكّد إغلاقه. إن رأيت خطأ في حركة فتواصل مع المحصّل ليعدّلها بنفسه قبل التأكيد؛ بعد التأكيد تُقفل الحركات وينتقل الصندوق إلى «المغلقة» جاهزًا للإرسال إلى التدقيق، وهو من يرفض ما يجده خطأ ويبيّن السبب.</p>}
            {auditing && <p className="rounded-control bg-sky-500/10 px-4 py-3 text-sm leading-7 text-sky-700 dark:text-sky-400">راجع حركات الصندوق. لإرجاعه بملاحظة على حركات بعينها اضغط «ملاحظة» بجانب كل منها ثم «إرجاع بملاحظة»؛ وإن لم تحدّد حركة فالملاحظة على الصندوق كله.</p>}

            <StatusGuide />

            <section aria-label="حركات الصندوق" className="space-y-4">
                <div className="data-table-toolbar flex flex-wrap items-center justify-between gap-3">
                    <div className="relative w-full sm:max-w-sm">
                        <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-gray-400" />
                        <input type="text" aria-label="ابحث في حركات الصندوق" placeholder="ابحث بالمشترك أو رقم الحساب أو السند أو الحوالة" value={search} onChange={(event) => setSearch(event.target.value)} className="block w-full py-2.5 pe-4 ps-10 text-sm" />
                    </div>
                    <SegmentedTabs label="حالة الحركة" value={filter} onChange={setFilter} options={filterOptions} />
                </div>
                <div className="data-table-container financial-ledger-container">
                    <table className={ledgerTableClass} style={fixedTableStyle(widths)}>
                        <ColumnWidths widths={widths} />
                        <thead><tr>{columns.map(([label], index) => index === columns.length - 1 ? <ActionsTh key={index} /> : <th key={index}>{label}</th>)}</tr></thead>
                        <tbody>
                            {shown.length === 0 ? (
                                <tr><td colSpan={columns.length} className="text-center text-gray-500">{entries.length ? 'لا توجد حركات بهذا البحث.' : 'لا توجد حركات في هذا الصندوق.'}</td></tr>
                            ) : shown.map((entry) => {
                                const [label, tone] = entryStatus(entry);
                                const live = isActive(entry);
                                const ledger = ledgerOf(entry);

                                return <tr key={entry.id} className={`${live ? '' : 'opacity-60'} ${flagged.has(entry.id) || noted.has(entry.id) ? 'bg-brand-500/[.05]' : ''}`}>
                                    <BoxNumberCell number={box.number} position={entries.indexOf(entry) + 1} />
                                    <LedgerLeadCells ledger={ledger} />
                                    <td title={subscriberName(entry)} style={{ whiteSpace: 'normal' }}>
                                        {entry.statement_url ? <Link href={entry.statement_url} prefetch className="font-semibold text-gray-900 hover:text-brand-600">{subscriberName(entry)}</Link> : <span className="font-semibold text-gray-900">{subscriberName(entry)}</span>}
                                        <span className="block font-display text-xs text-gray-400"><bdi dir="ltr">{entry.transaction?.subscription?.account_number ?? '—'}</bdi></span>
                                    </td>
                                    <LedgerTrailCells ledger={ledger} amount={entry.amount} currency={entry.currency} cancelled={!live} />
                                    <td style={{ whiteSpace: 'normal' }}><StatusPill tone={tone} label={label} />{noted.has(entry.id) && <span className="mt-1 block"><StatusPill tone="red" label="عليها ملاحظة" /></span>}</td>
                                    <td style={{ whiteSpace: 'normal' }}><div className="flex flex-wrap items-center gap-1">
                                        {entry.receipt_url && <a href={entry.receipt_url} target="_blank" rel="noopener noreferrer" className={`${rowButton} tone-print border`}><Icon name="printer" className="h-3.5 w-3.5" />السند</a>}
                                        {auditing && <button type="button" onClick={() => toggleFlag(entry.id)} aria-pressed={flagged.has(entry.id)} className={`${rowButton} border ${flagged.has(entry.id) ? 'border-brand-500/40 text-brand-600' : 'text-gray-600'}`}><Icon name="note" className="h-3.5 w-3.5" />{flagged.has(entry.id) ? 'إلغاء الملاحظة' : 'ملاحظة'}</button>}
                                    </div></td>
                                </tr>;
                            })}
                        </tbody>
                    </table>
                </div>
                <p className="data-table-totals text-sm text-gray-600">
                    <span>المعروض <b className="font-display text-gray-900">{shown.length}</b> من <b className="font-display text-gray-900">{entries.length}</b> حركة</span>
                    <span>مجموع الحركات السارية المعروضة: <b className="text-gray-900">{amountsLine(sumByCurrency(shown.filter(isActive)))}</b></span>
                </p>
            </section>

            {counted && <BoxCountSummary box={box} />}
        </div>

        <footer className="shrink-0 border-t border-gray-100 bg-surface p-4 sm:px-6">
            {auditing && <AuditActions flagged={[...flagged]} onApprove={audit.onApprove} onReturn={audit.onReturn} />}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">الإجمالي: <b className="text-gray-900">{amountsLine(totals)}</b> · {active.length} حركة سارية</p>
                <div className="flex flex-wrap items-center gap-2">
                    <SecondaryButton onClick={onClose}>إغلاق النافذة</SecondaryButton>
                    {confirmable && <PrimaryButton disabled={entries.length === 0} onClick={() => setConfirmingClose(true)}><Icon name="check" className="h-4 w-4" />تأكيد إغلاق الصندوق</PrimaryButton>}
                    {!audit && onSend && canSendBox(box) && <PrimaryButton onClick={() => onSend(box)}><Icon name="send" className="h-4 w-4" />إرسال إلى التدقيق</PrimaryButton>}
                </div>
            </div>
        </footer>
        <ConfirmDialog
            show={confirmingClose}
            onCancel={() => setConfirmingClose(false)}
            onConfirm={() => { setConfirmingClose(false); perform('receive', box); }}
            title="إغلاق الصندوق؟"
            message={<>سيُغلق {boxTypes[type]} رقم <bdi dir="ltr">{box.number}</bdi> لـ{box.user?.name ?? '—'} بإجمالي <b className="text-gray-900">{amountsLine(totals)}</b> ({active.length} حركة سارية). بعد الإغلاق تُقفل حركاته فلا يستطيع المحصّل تعديلها، وينتقل إلى «المغلقة» جاهزًا للإرسال إلى التدقيق.</>}
            confirmLabel="نعم، أغلق الصندوق"
            icon="lock"
        />
    </Modal>;
}

/**
 * The auditor's two answers to a box: send it back to its branch with a
 * note (on the entries marked, else on the whole box), or approve it,
 * charging the branch a debt for it if need be.
 */
function AuditActions({ flagged, onApprove, onReturn }) {
    const [mode, setMode] = useState(null);
    const [body, setBody] = useState('');
    const [debt, setDebt] = useState('');
    const [reason, setReason] = useState('');
    const charged = Number(debt) > 0;

    if (mode === 'return') {
        return <form className="mb-3 space-y-2 rounded-control border border-brand-500/25 bg-brand-500/[.04] p-3" onSubmit={(event) => { event.preventDefault(); onReturn(body.trim(), flagged); }}>
            <label htmlFor="audit-note" className="block text-sm font-semibold text-gray-700">ملاحظة التدقيق للفرع {flagged.length ? `(على ${flagged.length} حركة)` : '(على الصندوق كله)'}</label>
            <textarea id="audit-note" value={body} onChange={(event) => setBody(event.target.value)} rows={2} maxLength={3000} required autoFocus className="block w-full rounded-control border-gray-200 text-sm" placeholder="ما الذي يجب أن يصحّحه الفرع أو يوضّحه؟" />
            <div className="flex flex-wrap justify-end gap-2"><SecondaryButton onClick={() => setMode(null)}>تراجع</SecondaryButton><PrimaryButton type="submit" disabled={!body.trim()}><Icon name="undo" className="h-4 w-4" />إرجاع الصندوق بملاحظة</PrimaryButton></div>
        </form>;
    }
    if (mode === 'approve') {
        return <form className="mb-3 space-y-2 rounded-control border border-emerald-500/25 bg-emerald-500/[.05] p-3" onSubmit={(event) => { event.preventDefault(); onApprove(charged ? debt : null, charged ? reason.trim() : null); }}>
            <p className="text-sm font-semibold text-gray-700">اعتماد الصندوق</p>
            <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
                <label className="block text-xs text-gray-600">دين على الفرع (اختياري)<input type="number" min="0" step="0.01" dir="ltr" value={debt} onChange={(event) => setDebt(event.target.value)} className="mt-1 block w-full rounded-control border-gray-200 text-sm" placeholder="0.00" /></label>
                <label className="block text-xs text-gray-600">سبب الدين{charged ? '' : ' (عند تحميل دين)'}<input type="text" value={reason} onChange={(event) => setReason(event.target.value)} required={charged} maxLength={3000} className="mt-1 block w-full rounded-control border-gray-200 text-sm" placeholder="مثال: عجز في النقد" /></label>
            </div>
            <div className="flex flex-wrap justify-end gap-2"><SecondaryButton onClick={() => setMode(null)}>تراجع</SecondaryButton><PrimaryButton type="submit" disabled={charged && !reason.trim()}><Icon name="check" className="h-4 w-4" />{charged ? 'اعتماد وتحميل الدين على الفرع' : 'اعتماد الصندوق'}</PrimaryButton></div>
        </form>;
    }

    return <div className="mb-3 flex flex-wrap justify-end gap-2">
        <SecondaryButton onClick={() => setMode('return')} className="text-brand-600"><Icon name="undo" className="h-4 w-4" />إرجاع بملاحظة{flagged.length ? ` (${flagged.length})` : ''}</SecondaryButton>
        <PrimaryButton onClick={() => setMode('approve')}><Icon name="check" className="h-4 w-4" />اعتماد الصندوق</PrimaryButton>
    </div>;
}

/** A cash box the branch counted under the old two-step receipt: each currency's expected, counted and received amounts. */
function BoxCountSummary({ box }) {
    if (!box.expected_counts) return null;
    const money = (amount) => formatMoney(amount ?? 0);

    return <div className="overflow-x-auto rounded-panel border border-gray-100 bg-surface">
        <table className="w-full text-start text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500"><tr>{['العملة', 'المتوقع', 'عدّ المحصّل', 'عدّ المستلم', 'الفرق', 'القرار'].map((title) => <th key={title} className="whitespace-nowrap p-3 text-start">{title}</th>)}</tr></thead>
            <tbody>{Object.entries(currencies).map(([currency, label]) => <tr key={currency} className="border-t border-gray-100 text-gray-700">
                <td className="p-3">{label}</td>
                <td className="p-3 font-display" dir="ltr">{money(box.expected_counts[currency])}</td>
                <td className="p-3 font-display" dir="ltr">{box.collector_counts ? money(box.collector_counts[currency]) : '—'}</td>
                <td className="p-3 font-display" dir="ltr">{box.head_counts ? money(box.head_counts[currency]) : '—'}</td>
                <td className="p-3 font-display" dir="ltr">{box.head_counts ? money(Number(box.head_counts[currency]) - Number(box.expected_counts[currency])) : '—'}</td>
                <td className="p-3">{box.decisions?.[currency] === 'debt' ? 'دين على المحصّل' : box.decisions?.[currency] === 'accepted' ? 'مقبول' : '—'}</td>
            </tr>)}</tbody>
        </table>
        {box.reason && <p className="border-t border-gray-100 p-3 text-xs text-gray-500">السبب: {box.reason}</p>}
    </div>;
}
