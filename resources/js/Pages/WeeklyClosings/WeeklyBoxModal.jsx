import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import StatusPill from '@/Components/DataTable/StatusPill';
import { formatMoney } from '@/lib/format';
import { entryStatus } from '@/lib/financialBoxes';
import { BankMark } from '../Subscriptions/PaymentModal';
import { boxTypeStyles, BoxTypeIcon, currencies } from '../Payments/CollectorCashBox';
import { branchMoment, byReceivingBank, entriesWord, foreignLine, Shekels } from './WeeklyParts';
import './weekly-closing.css';

/**
 * What each box type's entries show beyond the subscriber and the amount:
 * a transfer names who sent it and from which bank (the bank it arrived at
 * heads its group), a clearing shows its statement, and cash its receipt.
 */
const ENTRY_COLUMNS = {
    cash: {
        reference: ['رقم سند القبض', (entry) => entry.voucher],
        columns: [],
        line: () => 'دفعة نقدية بسند قبض',
    },
    bank_transfer: {
        reference: ['رقم الحوالة', (entry) => entry.reference],
        columns: [['من (المحوِّل)', (entry) => <>
            <b className="block font-semibold text-gray-800">{entry.senderName || '—'}</b>
            <small className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">{entry.senderBank ? <><BankMark bank={entry.senderBank} className="h-4 w-4 rounded" />{entry.senderBank}</> : 'بنك المحوِّل غير مسجّل'}</small>
        </>]],
        line: (entry) => [entry.senderName && `من ${entry.senderName}`, entry.senderBank && `(${entry.senderBank})`].filter(Boolean).join(' ') || 'المحوِّل غير مسجّل',
    },
    clearing: {
        reference: ['رقم المقاصة', (entry) => entry.reference ?? entry.voucher],
        columns: [['البيان', (entry) => entry.notes || '—']],
        line: (entry) => entry.notes || '—',
    },
};

function EntryAmount({ entry }) {
    return entry.currency === 'ILS' ? <Shekels value={entry.amount} /> : <span className="whitespace-nowrap"><bdi dir="ltr" className="font-display">{formatMoney(entry.amount)}</bdi> {currencies[entry.currency]}</span>;
}

function ReferenceCode({ value }) {
    return value ? <code dir="ltr" className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-px font-mono text-xs text-gray-600">{value}</code> : <span className="text-gray-300">—</span>;
}

function EntryStatus({ entry }) {
    const [label, tone] = entryStatus(entry);

    return <StatusPill tone={tone} label={label} />;
}

/** A bank's group heading: its logo, name, how many transfers and their total. */
function BankHeading({ group }) {
    return <span className="flex items-center gap-3">
        <BankMark bank={group.bank} className="h-9 w-9 rounded-lg" />
        <span className="min-w-0 flex-1"><b className="block text-sm text-gray-900">{group.bank}</b><small className="block text-xs text-gray-500">البنك المستلم · {entriesWord(group.entries.length)}</small></span>
        <span className="text-end"><b className="block text-sm text-gray-900"><Shekels value={group.totals.ILS} /></b>{foreignLine(group.totals) && <small className="block text-xs text-gray-500">{foreignLine(group.totals)}</small>}</span>
    </span>;
}

/**
 * One box of the week, wide: who it belongs to, its totals, and every entry
 * in it as it was closed, transfers grouped by the bank they arrived at. A
 * wide window that leaves the page around it in sight (a click outside or
 * Escape closes it), it steps to the previous and next box of the list on
 * the page and marks the box reviewed on the way.
 */
export default function WeeklyBoxModal({ box, list, reviewed, canReview, onReview, onUnreview, onOpen, onClose, hasNextPending }) {
    const style = boxTypeStyles[box.type];
    const layout = ENTRY_COLUMNS[box.type] ?? ENTRY_COLUMNS.cash;
    const entries = box.payments ?? [];
    const index = list.findIndex((item) => item.id === box.id);
    const previous = list[index - 1];
    const next = list[index + 1];
    const groups = box.type === 'bank_transfer' ? byReceivingBank(entries) : [{ bank: null, entries }];
    const columnCount = 7 + layout.columns.length;
    const th = 'border-b border-gray-200 bg-gray-50 px-4 py-3 text-start text-xs font-semibold text-gray-500';
    const cell = (label, value, hint, className = '') => <div className={`bg-surface px-3 py-3 sm:px-4 ${className}`}><dt className="text-xs text-gray-500">{label}</dt><dd className="font-bold text-gray-900">{value}</dd>{hint && <dd className="text-xs text-gray-500">{hint}</dd>}</div>;
    let number = 0;

    return <Modal show onClose={onClose} maxWidth="full" centered panelClassName="weekly-box-window flex flex-col">
        <header className="border-b border-gray-100 px-5 pb-4 pt-5 sm:px-6">
            <div className="flex items-start gap-3">
                <BoxTypeIcon type={box.type} className="h-12 w-12" />
                <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-gray-900 sm:text-xl">صندوق <bdi dir="ltr" className="font-display">{box.number}</bdi> · {style.label}</h2>
                    <p className="text-xs text-gray-500">{box.userName ?? '—'} · {box.closedAt ? `أُغلق ${branchMoment(box.closedAt)}` : 'لم يُغلق بعد'}</p>
                </div>
                <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-control p-2 text-gray-500 transition hover:bg-gray-100"><Icon name="close" className="h-5 w-5" /></button>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-control border border-gray-100 bg-gray-100 md:grid-cols-5">
                {cell('المحصّل', box.userName ?? '—', null, 'hidden md:block')}
                {cell('أُغلق', branchMoment(box.closedAt), null, 'hidden md:block')}
                {cell('الحركات', <span className="font-display">{box.entries}</span>, box.cancelled ? `${box.cancelled} ملغاة` : null)}
                {cell('الإجمالي', <Shekels value={box.amounts?.ILS} />, foreignLine(box.amounts))}
                {cell('المراجعة', <span className={reviewed ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500'}>{reviewed ? 'تمت مراجعته' : 'لم يُراجع بعد'}</span>)}
            </dl>
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
            <p className="flex items-center gap-2 px-5 pb-2 pt-4 text-xs text-gray-400 sm:px-6"><Icon name="lock" className="h-4 w-4" />الحركات والمبالغ الأصلية كما أُغلقت في الفرع{box.type === 'bank_transfer' && ' · مجمّعة حسب البنك المستلم'}</p>
            {box.type === 'bank_transfer' && groups.length > 0 && <div className="hidden flex-wrap gap-2 px-5 pb-1 sm:px-6 md:flex">{groups.map((group) => <span key={group.bank} className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-surface py-1 pe-3 ps-1 text-xs">
                <BankMark bank={group.bank} className="h-6 w-6 rounded-full" />
                <span className="font-semibold text-gray-700">{group.bank}</span>
                <span className="font-display text-gray-400">{group.entries.length}</span>
                <b className="text-gray-900"><Shekels value={group.totals.ILS} /></b>
            </span>)}</div>}

            {!entries.length ? <p className="px-6 py-14 text-center text-sm text-gray-500">لا حركات في هذا الصندوق.</p> : <>
                <div className="hidden px-5 pb-5 pt-2 sm:px-6 md:block">
                    <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-control border border-gray-200 text-sm">
                        <thead><tr>
                            <th className={`${th} w-12`}>#</th>
                            <th className={th}>المشترك</th>
                            <th className={th}>رقم الحساب</th>
                            {layout.columns.map(([label]) => <th key={label} className={th}>{label}</th>)}
                            <th className={th}>{layout.reference[0]}</th>
                            <th className={th}>وقت التسجيل</th>
                            <th className={th}>المبلغ</th>
                            <th className={th}>الحالة</th>
                        </tr></thead>
                        {groups.map((group) => <tbody key={group.bank ?? 'all'}>
                            {group.bank && <tr><td colSpan={columnCount} className="border-b border-gray-200 bg-sky-500/[0.04] px-4 py-2.5"><BankHeading group={group} /></td></tr>}
                            {group.entries.map((entry) => {
                                number += 1;

                                return <tr key={entry.id} className={`hover:bg-gray-50 ${entry.transactionStatus !== 'active' ? 'opacity-50' : ''}`}>
                                    <td className="border-b border-gray-100 px-4 py-3.5 font-display text-xs text-gray-400">{number}</td>
                                    <td className="border-b border-gray-100 px-4 py-3.5 font-semibold text-gray-900">{entry.subscriber ?? '—'}</td>
                                    <td className="border-b border-gray-100 px-4 py-3.5"><bdi dir="ltr" className="font-display text-gray-700">{entry.accountNumber ?? '—'}</bdi></td>
                                    {layout.columns.map(([label, render]) => <td key={label} className="border-b border-gray-100 px-4 py-3.5 text-gray-700">{render(entry)}</td>)}
                                    <td className="border-b border-gray-100 px-4 py-3.5"><ReferenceCode value={layout.reference[1](entry)} /></td>
                                    <td className="border-b border-gray-100 px-4 py-3.5 text-gray-600">{branchMoment(entry.occurredAt)}</td>
                                    <td className="border-b border-gray-100 px-4 py-3.5 font-bold text-gray-900"><EntryAmount entry={entry} /></td>
                                    <td className="border-b border-gray-100 px-4 py-3.5"><EntryStatus entry={entry} /></td>
                                </tr>;
                            })}
                        </tbody>)}
                        <tfoot><tr className="bg-gray-50">
                            <td colSpan={columnCount - 2} className="px-4 py-3 text-sm font-semibold text-gray-700">إجمالي الصندوق · {entriesWord(box.entries)} سارية</td>
                            <td colSpan={2} className="px-4 py-3"><b className="text-base text-gray-900"><Shekels value={box.amounts?.ILS} /></b>{foreignLine(box.amounts) && <small className="block text-xs text-gray-500">{foreignLine(box.amounts)}</small>}</td>
                        </tr></tfoot>
                    </table>
                </div>

                <ul className="divide-y divide-gray-100 px-5 md:hidden">{(() => {
                    let position = 0;

                    return groups.map((group) => [
                        group.bank && <li key={`bank-${group.bank}`} className="-mx-5 border-y border-gray-200 bg-sky-500/[0.04] px-5 py-2.5"><BankHeading group={group} /></li>,
                        ...group.entries.map((entry) => {
                            position += 1;

                            return <li key={entry.id} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-3.5 ${entry.transactionStatus !== 'active' ? 'opacity-50' : ''}`}>
                                <span className="min-w-0">
                                    <b className="block truncate text-sm text-gray-900"><span className="me-1 font-display text-xs font-normal text-gray-400">{position}.</span>{entry.subscriber ?? '—'}</b>
                                    <span className="block text-xs text-gray-500">حساب <bdi dir="ltr" className="font-display">{entry.accountNumber ?? '—'}</bdi></span>
                                    <span className="block text-xs text-gray-500">{layout.line(entry)}</span>
                                </span>
                                <span className="text-end"><b className="block text-sm text-gray-900"><EntryAmount entry={entry} /></b><span className="block text-xs text-gray-400">{branchMoment(entry.occurredAt)}</span></span>
                                <span className="col-span-2 flex flex-wrap items-center gap-2"><ReferenceCode value={layout.reference[1](entry)} /><EntryStatus entry={entry} /></span>
                            </li>;
                        }),
                    ]);
                })()}</ul>
            </>}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3 sm:px-6">
            <div className="flex items-center gap-1">
                <button type="button" disabled={!previous} onClick={() => onOpen(previous.id)} aria-label="الصندوق السابق" className="rounded-control border border-gray-200 bg-surface p-2 text-gray-600 transition hover:bg-gray-100 disabled:opacity-30"><Icon name="chevron-right" className="h-4 w-4" /></button>
                <span className="px-1 text-xs text-gray-500">صندوق <b className="font-display">{index + 1}</b> من <b className="font-display">{list.length}</b></span>
                <button type="button" disabled={!next} onClick={() => onOpen(next.id)} aria-label="الصندوق التالي" className="rounded-control border border-gray-200 bg-surface p-2 text-gray-600 transition hover:bg-gray-100 disabled:opacity-30"><Icon name="chevron-left" className="h-4 w-4" /></button>
            </div>
            {!canReview ? <p className="text-xs text-gray-500">أُرسلت الحزمة. التفاصيل للعرض فقط.</p>
                : reviewed ? <button type="button" onClick={onUnreview} className="inline-flex items-center gap-2 rounded-control px-3 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-100"><Icon name="undo" className="h-4 w-4" />إلغاء علامة المراجعة</button>
                    : <button type="button" onClick={onReview} className="inline-flex items-center gap-2 rounded-control bg-gray-900 px-4 py-2.5 text-sm font-bold text-surface transition hover:bg-gray-800"><Icon name="check" className="h-4 w-4" />تمت مراجعة الصندوق{hasNextPending && ' · التالي'}</button>}
        </footer>
    </Modal>;
}
