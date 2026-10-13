import { Head, Link, router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ActionsTh from '@/Components/DataTable/ActionsTh';
import ColumnWidths, { fixedTableStyle } from '@/Components/DataTable/ColumnWidths';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import Pagination from '@/Components/DataTable/Pagination';
import StatusPill from '@/Components/DataTable/StatusPill';
import RowActionsMenu from '@/Components/DataTable/RowActionsMenu';
import SegmentedTabs from '@/Components/SegmentedTabs';
import { useDataTable } from '@/hooks/useDataTable';
import CashBoxTabs from './CashBoxTabs';
import CollectionNavigation from './CollectionNavigation';
import { boxTypeStyles, entryState } from './CollectorCashBox';
import { ledgerColumns, ledgerOf, ledgerTableClass, LedgerLeadCells, LedgerTrailCells } from './LedgerColumns';

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
    const columns = [['رقم الصندوق', 76], ...ledgerColumns.before, ['المشترك', null], ...ledgerColumns.after, ['الحالة', 140], ['', 48]];
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
                <table className={ledgerTableClass} style={fixedTableStyle(columnWidths)}>
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
                                <td style={{ whiteSpace: 'normal' }}>
                                    <Link href={entry.box.url} prefetch className="font-semibold text-brand-600 hover:underline">صندوق <bdi dir="ltr" className="font-display">{entry.box.number}</bdi></Link>
                                    <span className="block text-xs text-gray-400">{boxTypeStyles[entry.box.type].label}</span>
                                </td>
                                <LedgerLeadCells ledger={ledger} />
                                <td title={entry.subscriber} style={{ whiteSpace: 'normal' }}>
                                    <span className="font-semibold text-gray-900">{entry.subscriber}</span>
                                    <span className="block font-display text-xs text-gray-400"><bdi dir="ltr">{entry.accountNumber}</bdi></span>
                                </td>
                                <LedgerTrailCells ledger={ledger} amount={entry.amount} currency={entry.currency} cancelled={cancelled} />
                                <td style={{ whiteSpace: 'normal' }}><StatusPill tone={tone} label={label} />{entry.isLate && <span className="mt-1 block"><StatusPill tone="amber" label="متأخرة" /></span>}</td>
                                <td className="text-end">{entry.receiptUrl && (
                                    <RowActionsMenu>
                                        <button onClick={() => window.open(entry.receiptUrl, '_blank', 'noopener')}>طباعة السند</button>
                                    </RowActionsMenu>
                                )}</td>
                            </tr>;
                        })}
                    </tbody>
                </table>
            </div>
            <Pagination meta={entries} filters={{ search, per_page: filters.per_page, filter: filterValues }} extraParams={own ? {} : { branch_id: branch.id }} baseUrl={url} />
        </section>}
    </AuthenticatedLayout>;
}
