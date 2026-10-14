import { useState } from 'react';
import { Link } from '@inertiajs/react';
import ActionsTh from '@/Components/DataTable/ActionsTh';
import ColumnWidths, { fixedTableStyle } from '@/Components/DataTable/ColumnWidths';
import StatusPill from '@/Components/DataTable/StatusPill';
import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import SegmentedTabs from '@/Components/SegmentedTabs';
import { formatMoney } from '@/lib/format';
import { boxTypes, currencies, dateTime, BoxTypeIcon } from '../Payments/CollectorCashBox';
import { ledgerColumns, ledgerOf, ledgerTableClass, BoxNumberCell, LedgerLeadCells, LedgerTrailCells } from '../Payments/LedgerColumns';
import BoxBreakdown, { breakdownEntry } from '../Payments/BoxBreakdown';
import '../Payments/financial-boxes.css';

export const boxStatuses = { open: ['مفتوح', 'blue'], pending: ['بانتظار تأكيد الإغلاق', 'amber'], received: ['أُكّد إغلاقه', 'green'] };

/** A small action in an entry's row. */
const rowButton = 'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition hover:bg-gray-100';

const isActive = (entry) => !entry.transaction || entry.transaction.status === 'active';
const isRejected = (entry) => ['missing', 'rejected'].includes(entry.status);
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

/** An entry's state as a word and a tone: cancelled, in force, or where its bank or clearing check stands. */
function entryState(box, entry) {
    const clearing = box.type === 'clearing';
    if (!isActive(entry)) return ['ملغاة', 'gray'];
    if ((box.type ?? 'cash') === 'cash') return ['سارية', 'green'];
    if (entry.status === 'confirmed') return [clearing ? 'مقبولة' : 'مؤكدة', 'green'];
    if (isRejected(entry)) return [clearing ? 'مرفوضة' : 'غير موجودة في البنك', 'red'];

    return ['بانتظار المراجعة', 'amber'];
}

/** One figure in the box's summary strip. */
function Stat({ icon, label, value, hint }) {
    return <div className="flex items-start gap-3 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-gray-500"><Icon name={icon} className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0">
            <dt className="text-xs font-semibold text-gray-500">{label}</dt>
            <dd className="mt-1 font-display text-xl font-bold text-gray-900">{value}</dd>
            {hint && <dd className="mt-0.5 text-xs text-gray-500">{hint}</dd>}
        </div>
    </div>;
}

/**
 * One of the branch's boxes, large: who it belongs to, its totals and
 * dates, and every entry in it as the subscriber's statement shows it, to
 * search, filter and, once the collector has corrected anything the branch
 * raised with them, confirm the box closed from the footer. The branch does
 * not check a collector's transfers or clearings one by one: the audit does,
 * after the box's close; only direct payments, with no collector, are
 * checked here.
 */
export default function BoxDetails({ box, access, onClose, perform, period }) {
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [cashCounted, setCashCounted] = useState(false);
    const type = box.type ?? 'cash';
    const cash = type === 'cash';
    const clearing = type === 'clearing';
    const entries = box.payments ?? [];
    const active = entries.filter(isActive);
    const totals = sumByCurrency(active);
    const canReview = box.canCount && box.kind === 'direct';
    const editable = ['open', 'pending'].includes(box.status);
    const confirmable = !box.frozen && box.canCount && ['open', 'pending'].includes(box.status) && box.kind !== 'direct';
    const confirmsDelivery = cash && box.isOwn && box.status === 'received' && !box.confirmed_at && !box.frozen;
    const counted = cash && box.head_counts && box.expected_counts && Object.keys(currencies).some((currency) => Number(box.head_counts[currency] ?? 0) !== Number(box.expected_counts[currency] ?? 0));
    const groups = {
        all: ['الكل', () => true],
        active: ['سارية', isActive],
        ...(cash ? {} : { pending: ['بانتظار المراجعة', (entry) => isActive(entry) && entry.status === 'pending'], rejected: [clearing ? 'مرفوضة' : 'غير موجودة', (entry) => isActive(entry) && isRejected(entry)] }),
        cancelled: ['ملغاة', (entry) => !isActive(entry)],
    };
    const filterOptions = Object.entries(groups).map(([value, [label, matches]]) => ({ value, label: `${label} · ${entries.filter(matches).length}`, count: entries.filter(matches).length })).filter((option) => option.value === 'all' || option.count > 0);
    const query = search.trim();
    const shown = entries.filter(groups[filter]?.[1] ?? (() => true)).filter((entry) => !query || [subscriberName(entry), entry.transaction?.subscription?.account_number, entry.transaction?.manual_voucher_number, entry.transaction?.voucher_number, entry.transaction?.reference_number, entry.transaction?.notes].some((value) => String(value ?? '').includes(query)));
    const columns = [['الصندوق', 72], ...ledgerColumns.before, ['المشترك', 150], ...ledgerColumns.after, ['الحالة', 140], ['', canReview ? 190 : 110]];
    const widths = columns.map(([, width]) => width);

    return <Modal show onClose={onClose} maxWidth="full" centered panelClassName="financial-box-detail flex max-h-[calc(100dvh-4rem)] flex-col">
        <header className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-gray-100 p-6">
            <div className="flex items-center gap-3">
                <BoxTypeIcon type={type} className="h-12 w-12" />
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">{boxTypes[type]} · صندوق <bdi dir="ltr" className="font-display">{box.number}</bdi></h2>
                    <p className="mt-1 text-sm text-gray-500">{box.user?.name ?? 'الدفعات المباشرة'}{period ? ` · ${period}` : ''}</p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <StatusPill tone={boxStatuses[box.status][1]} label={boxStatuses[box.status][0]} />
                <button type="button" onClick={onClose} aria-label="إغلاق النافذة" className="rounded-control p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"><Icon name="close" className="h-5 w-5" /></button>
            </div>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-gray-50/60 p-4 sm:p-6">
            <dl className="grid divide-y divide-gray-100 rounded-panel border border-gray-100 bg-surface sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x xl:divide-x-reverse">
                <Stat icon="wallet" label="إجمالي الحركات السارية" value={<>{formatMoney(totals.ILS)} <span className="text-sm font-normal text-gray-500">شيكل</span></>} hint={otherCurrencies(totals)} />
                <Stat icon="list" label="الحركات" value={active.length.toLocaleString('en')} hint={entries.length > active.length ? `و${entries.length - active.length} ملغاة` : 'لا حركات ملغاة'} />
                <Stat icon={editable ? 'unlock' : 'lock'} label="تصحيح الحركات" value={<span className="text-base">{editable ? 'متاح للمحصّل' : 'مقفل'}</span>} hint={editable ? 'حتى تأكيد إغلاق الصندوق' : 'أُكّد إغلاق الصندوق'} />
                <Stat icon="calendar" label="فُتح ← أُغلق" value={<span className="text-sm">{dateTime(box.opened_at)}</span>} hint={box.closed_at ? dateTime(box.closed_at) : 'لا يزال مفتوحًا'} />
            </dl>

            <BoxBreakdown type={type} entries={active.map(breakdownEntry)} wide />

            {confirmable && <p className="rounded-control bg-sky-500/10 px-4 py-3 text-sm leading-7 text-sky-700 dark:text-sky-400">اطّلع على حركات الصندوق ثم أكّد إغلاقه. إن رأيت خطأ في حركة فتواصل مع المحصّل ليعدّلها بنفسه قبل التأكيد؛ بعد التأكيد تُقفل الحركات ويذهب الصندوق إلى التدقيق، وهو من يرفض الحوالات أو المقاصات ويبيّن السبب.{cash ? ' عُدّ النقد الذي سلّمه المحصّل وتأكد أنه يطابق إجمالي الصندوق قبل التأكيد.' : ''} تسليم الصناديق للشركة خطوة منفصلة.</p>}

            <section aria-label="حركات الصندوق" className="space-y-4">
                <div className="data-table-toolbar flex flex-wrap items-center justify-between gap-3">
                    <div className="relative w-full sm:max-w-sm">
                        <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-gray-400" />
                        <input type="text" aria-label="ابحث في حركات الصندوق" placeholder="ابحث بالمشترك أو رقم الحساب أو السند أو الحوالة" value={search} onChange={(event) => setSearch(event.target.value)} className="block w-full py-2.5 pe-4 ps-10 text-sm" />
                    </div>
                    <SegmentedTabs label="حالة الحركة" value={filter} onChange={setFilter} options={filterOptions} />
                </div>
                <div className="data-table-container">
                    <table className={ledgerTableClass} style={fixedTableStyle(widths)}>
                        <ColumnWidths widths={widths} />
                        <thead><tr>{columns.map(([label], index) => index === columns.length - 1 ? <ActionsTh key={index} /> : <th key={index}>{label}</th>)}</tr></thead>
                        <tbody>
                            {shown.length === 0 ? (
                                <tr><td colSpan={columns.length} className="text-center text-gray-500">{entries.length ? 'لا توجد حركات بهذا البحث.' : 'لا توجد حركات في هذا الصندوق.'}</td></tr>
                            ) : shown.map((entry) => {
                                const [label, tone] = entryState(box, entry);
                                const live = isActive(entry);
                                const ledger = ledgerOf(entry);

                                return <tr key={entry.id} className={live ? undefined : 'opacity-60'}>
                                    <BoxNumberCell number={box.number} position={entries.indexOf(entry) + 1} />
                                    <LedgerLeadCells ledger={ledger} />
                                    <td title={subscriberName(entry)} style={{ whiteSpace: 'normal' }}>
                                        {entry.statement_url ? <Link href={entry.statement_url} prefetch className="font-semibold text-gray-900 hover:text-brand-600">{subscriberName(entry)}</Link> : <span className="font-semibold text-gray-900">{subscriberName(entry)}</span>}
                                        <span className="block font-display text-xs text-gray-400"><bdi dir="ltr">{entry.transaction?.subscription?.account_number ?? '—'}</bdi></span>
                                    </td>
                                    <LedgerTrailCells ledger={ledger} amount={entry.amount} currency={entry.currency} cancelled={!live} />
                                    <td style={{ whiteSpace: 'normal' }}><StatusPill tone={tone} label={label} />{entry.is_late && <span className="mt-1 block"><StatusPill tone="amber" label="متأخرة" /></span>}</td>
                                    <td style={{ whiteSpace: 'normal' }}><div className="flex flex-wrap items-center gap-1">
                                        {live && !cash && canReview && !box.frozen && entry.status !== 'confirmed' && <>
                                            <button type="button" className={`${rowButton} text-emerald-700 dark:text-emerald-400`} onClick={() => perform('electronic', entry, { status: 'confirmed' })}><Icon name="check" className="h-3.5 w-3.5" />{clearing ? 'قبول' : 'تأكيد'}</button>
                                            {!isRejected(entry) && <button type="button" className={`${rowButton} text-brand-600`} onClick={() => perform('electronic', entry, { status: clearing ? 'rejected' : 'missing' })}><Icon name="close" className="h-3.5 w-3.5" />{clearing ? 'رفض' : 'غير موجودة'}</button>}
                                        </>}
                                        {live && !box.frozen && access.manage && box.kind !== 'direct' && box.status === 'open' && type === 'bank_transfer' && entry.status === 'pending' && <button type="button" className={`${rowButton} text-gray-600`} onClick={() => perform('direct', entry)}>نقل للدفعات المباشرة</button>}
                                        {entry.receipt_url && <a href={entry.receipt_url} target="_blank" rel="noopener noreferrer" className={`${rowButton} text-gray-600`}><Icon name="printer" className="h-3.5 w-3.5" />السند</a>}
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
            {cash && box.status === 'received' && box.head_counts && <p className="text-sm text-gray-600">استلم الفرع: <b className="text-gray-900">{amountsLine(box.head_counts)}</b></p>}
        </div>

        <footer className="shrink-0 border-t border-gray-100 bg-surface p-4 sm:px-6">
            {confirmable && cash && <label className="mb-3 flex cursor-pointer items-start gap-3 rounded-control border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm text-gray-800">
                <input type="checkbox" className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" checked={cashCounted} onChange={(event) => setCashCounted(event.target.checked)} />
                <span>عددتُ النقد الذي سلّمه المحصّل، ووجدته مطابقًا لإجمالي الصندوق: <b className="text-gray-900">{amountsLine(totals)}</b></span>
            </label>}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">الإجمالي: <b className="text-gray-900">{amountsLine(totals)}</b> · {active.length} حركة سارية</p>
                <div className="flex flex-wrap items-center gap-2">
                    <SecondaryButton onClick={onClose}>إغلاق النافذة</SecondaryButton>
                    {confirmable && <PrimaryButton disabled={entries.length === 0 || (cash && !cashCounted)} onClick={() => perform('receive', box, cash ? { cash_counted: true } : {})}><Icon name="check" className="h-4 w-4" />تأكيد إغلاق الصندوق</PrimaryButton>}
                    {confirmsDelivery && <PrimaryButton onClick={() => perform('confirm', box)}>أؤكّد تسليم الصندوق</PrimaryButton>}
                </div>
            </div>
        </footer>
    </Modal>;
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
