import { Head, Link, router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ActionsTh from '@/Components/DataTable/ActionsTh';
import ColumnWidths, { fixedTableStyle } from '@/Components/DataTable/ColumnWidths';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import Pagination from '@/Components/DataTable/Pagination';
import StatusPill from '@/Components/DataTable/StatusPill';
import Icon from '@/Components/Icon';
import SegmentedTabs from '@/Components/SegmentedTabs';
import { useDataTable } from '@/hooks/useDataTable';
import CashBoxTabs from './CashBoxTabs';
import CollectionNavigation from './CollectionNavigation';
import { boxTypeStyles, entryState } from './CollectorCashBox';
import { ledgerColumns, ledgerOf, LedgerLeadCells, LedgerTrailCells } from './LedgerColumns';

/** A small action in an entry's row. */
const rowButton = 'inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-semibold transition hover:bg-gray-100';

/**
 * Every entry of the boxes in one table, each as the subscriber's statement
 * shows it and with the number of the box it sits in: the collector's own
 * entries (`scope` own), or every entry of the branch's boxes for those who
 * close them (`scope` branch). A filter narrows the table to one type of
 * box: cash, bank transfers or clearings.
 */
export default function Entries({ scope, started, branchName, branch, branches, entries, filters, counts, pendingCount, branchPendingCount, collectionUrls }) {
    const { can } = usePage().props;
    const own = scope === 'own';
    const url = own ? collectionUrls.entries : collectionUrls.branchEntries;
    const { search, setSearch, setPerPage, filterValues, setFilter } = useDataTable(url, filters, own ? {} : { branch_id: branch.id });
    const type = filterValues.type ?? '';
    const typeFilters = [
        { value: '', label: `كل الحركات · ${counts.all}` },
        ...Object.entries(boxTypeStyles).map(([value, style]) => ({ value, label: `${style.label} · ${counts[value] ?? 0}` })),
    ];
    const columns = [['رقم الصندوق', 130], ...ledgerColumns.before, ['المشترك', null], ...ledgerColumns.after, ['الحالة', 150], ['', 130]];
    const columnWidths = columns.map(([, width]) => width);
    const title = own ? 'الحركات' : 'الصناديق المالية';

    return <AuthenticatedLayout header={<div className="flex flex-wrap items-end justify-between gap-4">
        <div>
            <p className="text-sm font-semibold text-gray-500">{!own && branches.length > 1 ? <select aria-label="الفرع" className="rounded-control border-gray-200 py-1 text-sm" value={branch.id} onChange={(event) => router.get(url, { branch_id: event.target.value })}>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : (branchName ?? 'حسابك الحالي')}</p>
            <h2 className="mt-1 text-3xl font-bold text-gray-900">{title}</h2>
        </div>
        {!own && <CashBoxTabs urls={collectionUrls} active="branchEntries" branchPendingCount={branchPendingCount} />}
    </div>}>
        <Head title={own ? 'الحركات' : 'حركات الموظفين'} />
        {(own || can.viewOwnCashBoxes) && <CollectionNavigation urls={collectionUrls} active={own ? 'entries' : 'cashBoxes'} pendingCount={pendingCount} />}
        {!started ? <p className="rounded-panel border border-dashed border-gray-200 bg-surface p-6 text-sm leading-7 text-gray-500">{branchName ? 'لم يُفعّل نظام الصناديق في هذا الفرع بعد. يُفعّله مسؤول الفرع من صفحة الخزنة والكشوفات.' : 'حسابك غير مرتبط بفرع، لذلك لا توجد حركات صناديق.'}</p> : <section aria-label={own ? 'حركات صناديقي' : 'حركات صناديق الموظفين'} className="space-y-4">
            <DataTableToolbar
                search={search}
                onSearchChange={setSearch}
                placeholder="ابحث بالمشترك أو رقم الحساب أو السند أو رقم الصندوق"
                perPage={filters.per_page}
                onPerPageChange={setPerPage}
                total={entries.total}
                filterMenu={<div className="flex w-full flex-wrap items-center gap-3"><SegmentedTabs label="نوع الصندوق" value={type} onChange={(value) => setFilter('type', value)} options={typeFilters} /></div>}
            />
            <div className="data-table-container">
                <table className="data-table data-table-fixed w-full text-start text-sm" style={fixedTableStyle(columnWidths)}>
                    <ColumnWidths widths={columnWidths} />
                    <thead>
                        <tr>{columns.map(([label], index) => index === columns.length - 1 ? <ActionsTh key={index} /> : <th key={index}>{label}</th>)}</tr>
                    </thead>
                    <tbody>
                        {entries.data.length === 0 ? (
                            <tr><td colSpan={columns.length} className="text-center text-gray-500">لا توجد حركات بهذا البحث.</td></tr>
                        ) : entries.data.map((entry) => {
                            const [label, tone] = entryState(entry.box.type, entry);
                            const cancelled = entry.transactionStatus !== 'active';
                            const ledger = ledgerOf(entry);

                            return <tr key={entry.id} className={cancelled ? 'opacity-60' : undefined}>
                                <td>
                                    <Link href={entry.box.url} prefetch className="font-semibold text-brand-600 hover:underline">صندوق <bdi dir="ltr" className="font-display">{entry.box.number}</bdi></Link>
                                    <span className="block text-xs text-gray-400">{boxTypeStyles[entry.box.type].label}</span>
                                </td>
                                <LedgerLeadCells ledger={ledger} />
                                <td title={entry.subscriber}>
                                    <span className="font-semibold text-gray-900">{entry.subscriber}</span>
                                    <span className="block font-display text-xs text-gray-400"><bdi dir="ltr">{entry.accountNumber}</bdi></span>
                                </td>
                                <LedgerTrailCells ledger={ledger} amount={entry.amount} currency={entry.currency} cancelled={cancelled} />
                                <td style={{ whiteSpace: 'normal' }}><StatusPill tone={tone} label={label} />{entry.isLate && <span className="mt-1 block"><StatusPill tone="amber" label="متأخرة" /></span>}</td>
                                <td style={{ whiteSpace: 'normal' }}><div className="flex flex-wrap items-center gap-1">
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
    </AuthenticatedLayout>;
}
