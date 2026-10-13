import { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ActionsTh from '@/Components/DataTable/ActionsTh';
import ColumnWidths, { fixedTableStyle } from '@/Components/DataTable/ColumnWidths';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import Pagination from '@/Components/DataTable/Pagination';
import StatusPill from '@/Components/DataTable/StatusPill';
import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import SegmentedTabs from '@/Components/SegmentedTabs';
import { useDataTable } from '@/hooks/useDataTable';
import { formatMoney } from '@/lib/format';
import CashBoxTabs from './CashBoxTabs';
import CollectionNavigation from './CollectionNavigation';
import { boxTypeStyles, currencies, dateTime, entryState, AuditNoteReply } from './CollectorCashBox';

/** A small action in an entry's row. */
const rowButton = 'inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-semibold transition hover:bg-gray-100';

/** The entry's voucher, transfer reference or clearing service, whichever its box keeps. */
function entryReference(entry) {
    if (entry.box.type === 'cash') return entry.voucherNumber ? `سند ${entry.voucherNumber}` : null;
    if (entry.box.type === 'bank_transfer') return entry.referenceNumber ? `حوالة ${entry.referenceNumber}` : null;

    return entry.service;
}

/** What the branch asked about an entry it sent back, and the collector's answer. */
function ReturnedNote({ returned, own }) {
    const waiting = !returned.reply;

    return <div className="mt-2 space-y-1 text-xs leading-5" style={{ whiteSpace: 'normal' }}>
        <StatusPill tone={waiting ? 'amber' : 'blue'} label={waiting ? (own ? 'بانتظار ردّك' : 'بانتظار ردّ المحصّل') : (own ? 'رددت عليها' : 'ردّ المحصّل')} />
        <p className="text-gray-600"><b className="text-gray-800">{returned.by ?? 'الفرع'}:</b> {returned.note}</p>
        {returned.reply && <p className="text-gray-900"><b>الرد:</b> {returned.reply}</p>}
    </div>;
}

/**
 * Every entry of the boxes in one table, each with the number of the box
 * it sits in: the collector's own entries (`scope` own), or every entry of
 * the branch's boxes for those who close them (`scope` branch), with the
 * collector's name. A filter narrows the table to the entries the branch
 * sent back to the collector, and to those waiting on an answer or
 * answered; the collector answers from the row.
 */
export default function Entries({ scope, started, branchName, branch, branches, entries, filters, counts, pendingCount, branchPendingCount, collectionUrls }) {
    const { can } = usePage().props;
    const own = scope === 'own';
    const url = own ? collectionUrls.entries : collectionUrls.branchEntries;
    const { search, setSearch, setPerPage, filterValues, setFilter } = useDataTable(url, filters, own ? {} : { branch_id: branch.id });
    const [replying, setReplying] = useState(null);
    const [saved, setSaved] = useState(null);
    const state = filterValues.state ?? '';
    const stateFilters = [
        { value: '', label: `كل الحركات · ${counts.all}` },
        { value: 'returned', label: `مُرجعة للمحصّل · ${counts.returned}` },
        { value: 'waiting', label: `${own ? 'بانتظار ردّك' : 'بانتظار الرد'} · ${counts.waiting}` },
        { value: 'replied', label: `${own ? 'رددت عليها' : 'تمّ الرد'} · ${counts.replied}` },
    ];
    const columnWidths = [150, 120, ...(own ? [] : [130]), null, 140, 220, 125];
    const title = own ? 'الحركات' : 'الصناديق المالية';
    const replyingEntry = entries.data.find((entry) => entry.id === replying);

    return <AuthenticatedLayout header={<div className="flex flex-wrap items-end justify-between gap-4">
        <div>
            <p className="text-sm font-semibold text-gray-500">{!own && branches.length > 1 ? <select aria-label="الفرع" className="rounded-control border-gray-200 py-1 text-sm" value={branch.id} onChange={(event) => router.get(url, { branch_id: event.target.value })}>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : (branchName ?? 'حسابك الحالي')}</p>
            <h2 className="mt-1 text-3xl font-bold text-gray-900">{title}</h2>
        </div>
        {!own && <CashBoxTabs urls={collectionUrls} active="branchEntries" branchPendingCount={branchPendingCount} />}
    </div>}>
        <Head title={own ? 'الحركات' : 'حركات الموظفين'} />
        {(own || can.viewOwnCashBoxes) && <CollectionNavigation urls={collectionUrls} active={own ? 'entries' : 'cashBoxes'} pendingCount={pendingCount} />}
        {saved && <p role="status" className="mb-4 rounded-control bg-emerald-500/10 p-4 text-sm text-emerald-700">{saved}</p>}
        {!started ? <p className="rounded-panel border border-dashed border-gray-200 bg-surface p-6 text-sm leading-7 text-gray-500">{branchName ? 'لم يُفعّل نظام الصناديق في هذا الفرع بعد. يُفعّله مسؤول الفرع من صفحة الخزنة والكشوفات.' : 'حسابك غير مرتبط بفرع، لذلك لا توجد حركات صناديق.'}</p> : <section aria-label={own ? 'حركات صناديقي' : 'حركات صناديق الموظفين'} className="space-y-4">
            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="ابحث بالمشترك أو رقم الحساب أو السند أو رقم الصندوق"
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={entries.total}
                filterMenu={<div className="flex w-full flex-wrap items-center gap-3"><SegmentedTabs label="الحركات المعروضة" value={state} onChange={(value) => setFilter('state', value)} options={stateFilters} /></div>}
            />
            <div className="data-table-container">
                <table className="data-table data-table-fixed w-full text-start text-sm" style={fixedTableStyle(columnWidths)}>
                    <ColumnWidths widths={columnWidths} />
                    <thead>
                        <tr>
                            <th>التاريخ والسند</th>
                            <th>رقم الصندوق</th>
                            {!own && <th>المحصّل</th>}
                            <th>المشترك</th>
                            <th>المبلغ</th>
                            <th>الحالة والإرجاع</th>
                            <ActionsTh />
                        </tr>
                    </thead>
                    <tbody>
                        {entries.data.length === 0 ? (
                            <tr><td colSpan={columnWidths.length} className="text-center text-gray-500">{state ? 'لا توجد حركات مُرجعة بهذا الفلتر.' : 'لا توجد حركات بهذا البحث.'}</td></tr>
                        ) : entries.data.map((entry) => {
                            const [label, tone] = entryState(entry.box.type, entry);
                            const cancelled = entry.transactionStatus !== 'active';

                            return <tr key={entry.id} className={cancelled ? 'opacity-60' : undefined}>
                                <td className="text-xs text-gray-600" title={entryReference(entry) ?? ''}>{dateTime(entry.occurredAt)}{entryReference(entry) && <span className="mt-0.5 block font-display text-gray-400">{entryReference(entry)}</span>}{entry.isLate && <span className="mt-1 block"><StatusPill tone="amber" label="متأخرة" /></span>}</td>
                                <td>
                                    <Link href={entry.box.url} prefetch className="font-semibold text-brand-600 hover:underline">صندوق <bdi dir="ltr" className="font-display">{entry.box.number}</bdi></Link>
                                    <span className="block text-xs text-gray-400">{boxTypeStyles[entry.box.type].label}</span>
                                </td>
                                {!own && <td className="text-gray-700" title={entry.collector ?? 'الدفعات المباشرة'}>{entry.collector ?? 'الدفعات المباشرة'}</td>}
                                <td title={entry.subscriber}>
                                    <span className="font-semibold text-gray-900">{entry.subscriber}</span>
                                    <span className="block font-display text-xs text-gray-400"><bdi dir="ltr">{entry.accountNumber}</bdi></span>
                                </td>
                                <td><b dir="ltr" className={`font-display ${cancelled ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{formatMoney(entry.amount)}</b> <span className="text-xs text-gray-500">{currencies[entry.currency]}</span></td>
                                <td style={{ whiteSpace: 'normal' }}><StatusPill tone={tone} label={label} />{entry.returned && <ReturnedNote returned={entry.returned} own={own} />}</td>
                                <td style={{ whiteSpace: 'normal' }}><div className="flex flex-wrap items-center gap-1">
                                    {own && entry.returned?.replyUrl && <button type="button" className={`${rowButton} text-amber-700 dark:text-amber-400`} onClick={() => setReplying(entry.id)}><Icon name="messages" className="h-3.5 w-3.5" />الرد</button>}
                                    {!own && <Link href={entry.box.url} className={`${rowButton} text-gray-600`}><Icon name="eye" className="h-3.5 w-3.5" />فتح الصندوق</Link>}
                                    {entry.receiptUrl && <a href={entry.receiptUrl} target="_blank" rel="noopener noreferrer" className={`${rowButton} text-gray-600`}><Icon name="printer" className="h-3.5 w-3.5" />السند</a>}
                                </div></td>
                            </tr>;
                        })}
                    </tbody>
                </table>
            </div>
            <Pagination meta={entries} filters={{ search, per_page: filters.per_page, filter: filterValues }} extraParams={own ? {} : { branch_id: branch.id }} baseUrl={url} />
        </section>}
        {replyingEntry && <Modal show onClose={() => setReplying(null)} maxWidth="lg" centered>
            <div className="space-y-4 p-6">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">الرد على الفرع</h3>
                        <p className="mt-1 text-sm text-gray-500">صندوق <bdi dir="ltr" className="font-display">{replyingEntry.box.number}</bdi> · {replyingEntry.subscriber} · <bdi dir="ltr" className="font-display">{formatMoney(replyingEntry.amount)}</bdi> {currencies[replyingEntry.currency]}</p>
                    </div>
                    <button type="button" onClick={() => setReplying(null)} aria-label="إغلاق النافذة" className="rounded-control p-2 text-gray-500 hover:bg-gray-100"><Icon name="close" className="h-5 w-5" /></button>
                </div>
                <p className="rounded-control bg-amber-500/5 p-3 text-sm leading-7 text-gray-700"><b className="text-gray-900">{replyingEntry.returned.by ?? 'الفرع'}: </b>{replyingEntry.returned.note}</p>
                <AuditNoteReply note={{ id: `entry-${replyingEntry.id}`, replyUrl: replyingEntry.returned.replyUrl }} onSaved={() => { setReplying(null); setSaved('أُرسل ردّك إلى الفرع.'); }} />
            </div>
        </Modal>}
    </AuthenticatedLayout>;
}
