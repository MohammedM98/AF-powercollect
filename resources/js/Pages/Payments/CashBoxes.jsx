import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ActionsTh from '@/Components/DataTable/ActionsTh';
import ColumnWidths, { fixedTableStyle } from '@/Components/DataTable/ColumnWidths';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import Pagination from '@/Components/DataTable/Pagination';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import SegmentedTabs from '@/Components/SegmentedTabs';
import CashBoxTabs from './CashBoxTabs';
import CollectionNavigation from './CollectionNavigation';
import { boxTypes, boxTypeStyles, currencies, dateTime, Amounts, BoxReportActions, BoxStage, BoxTypeChip } from './CollectorCashBox';

/** Where each type of box goes when it closes. */
const destinations = { cash: 'خزنة الفرع', bank_transfer: 'حساب البنك', clearing: 'المقاصات' };

/** The dot on a box's tile: green while open, amber while it waits on someone, grey once done. */
const stageDots = { open: 'green', awaiting_branch: 'amber', awaiting_confirmation: 'amber', completed: 'gray' };

const typeFilters = [{ value: '', label: 'الكل' }, ...Object.entries(boxTypeStyles).map(([value, style]) => ({ value, label: style.label }))];
const stateFilters = [{ value: '', label: 'الكل' }, { value: 'open', label: 'مفتوح' }, { value: 'closed', label: 'مغلق' }];

/** The table's column widths, in its column order; who closed the box takes what is left. */
const columnWidths = [190, 150, 120, 100, 170, 170, 170, 170, 160, 230, null, 150];

/** The currencies a box holds, by name. */
function heldCurrencies(box) {
    const held = Object.keys(currencies).filter((currency) => Number(box.totals?.[currency] ?? 0) !== 0);

    return (held.length ? held : ['ILS']).map((currency) => currencies[currency]).join('، ');
}

/**
 * Every box the collector had, in the site's table: its type, totals,
 * dates, where and by whom it was closed, its stage, its details and its
 * report to print or download. What is open now and what waits on the
 * collector are on the summary page.
 */
export default function CashBoxes({ started, branchName, boxes, filters, pendingCount, branchPendingCount, collectionUrls }) {
    function filter(key, value) {
        router.get(collectionUrls.cashBoxes, { ...filters, [key]: value }, { preserveState: true, preserveScroll: true, replace: true });
    }

    return <AuthenticatedLayout header={<div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-gray-500">{branchName ?? 'حسابك الحالي'}</p><h2 className="mt-1 text-3xl font-bold text-gray-900">الصناديق المالية</h2></div><CashBoxTabs urls={collectionUrls} active="own" branchPendingCount={branchPendingCount} /></div>}>
        <Head title="الصناديق المالية" />
        <CollectionNavigation urls={collectionUrls} active="cashBoxes" pendingCount={pendingCount} />
        {started ? <div className="space-y-4">
            <section aria-label="كل صناديقي" className="space-y-4">
                <DataTableToolbar
                    showSearch={false}
                    perPage={filters.per_page}
                    onPerPageChange={(perPage) => filter('per_page', perPage)}
                    total={boxes.total}
                    filterMenu={
                        <div className="flex w-full flex-wrap items-center gap-3">
                            <SegmentedTabs label="نوع الصندوق" value={filters.type} onChange={(value) => filter('type', value)} options={typeFilters} />
                            <SegmentedTabs label="حالة الصندوق" value={filters.state} onChange={(value) => filter('state', value)} options={stateFilters} />
                        </div>
                    }
                />
                <div className="data-table-container">
                    <table className="data-table data-table-fixed w-full text-start text-sm" style={fixedTableStyle(columnWidths)}>
                        <ColumnWidths widths={columnWidths} />
                        <thead>
                            <tr>
                                <th>رقم الصندوق</th>
                                <th>النوع</th>
                                <th>العملة</th>
                                <th>الحركات</th>
                                <th>الإجمالي</th>
                                <th>المبلغ المستلم</th>
                                <th>تاريخ فتح الصندوق</th>
                                <th>تاريخ إغلاق الصندوق</th>
                                <th>أُغلق إلى</th>
                                <th>حالة الصندوق</th>
                                <th>أغلقه</th>
                                <ActionsTh />
                            </tr>
                        </thead>
                        <tbody>
                            {boxes.data.length === 0 ? (
                                <tr><td colSpan={12} className="text-center text-gray-500">لا توجد صناديق بهذه الفلاتر.</td></tr>
                            ) : boxes.data.map((box) => (
                                <tr key={box.id}>
                                    <td><Link href={box.urls.show} prefetch className="block"><RowIdentity icon={boxTypeStyles[box.type].icon} name={`صندوق ${box.number}`} subtitle={boxTypes[box.type]} status={stageDots[box.stage]} /></Link></td>
                                    <td><BoxTypeChip type={box.type} /></td>
                                    <td className="whitespace-nowrap text-gray-600">{heldCurrencies(box)}</td>
                                    <td className="font-display text-gray-600">{box.paymentCount}</td>
                                    <td><Amounts amounts={box.totals} /></td>
                                    <td>{box.receivedAt ? <Amounts amounts={box.receivedAmounts} /> : <span className="text-gray-400">—</span>}</td>
                                    <td className="whitespace-nowrap text-xs text-gray-600">{dateTime(box.openedAt)}</td>
                                    <td className="whitespace-nowrap text-xs text-gray-600">{box.closedAt ? dateTime(box.closedAt) : <span className="text-gray-400">لا يزال مفتوحًا</span>}</td>
                                    <td className="whitespace-nowrap text-gray-600">{box.status === 'open' ? '—' : <>{destinations[box.type]}{box.settledIn && <span className="block text-xs text-gray-500">أسبوع <bdi dir="ltr">{box.settledIn.start}</bdi></span>}</>}</td>
                                    <td><BoxStage box={box} /></td>
                                    <td className="whitespace-nowrap text-gray-600">{box.closedBy ?? '—'}</td>
                                    <td className="text-end"><BoxReportActions box={box} onView={() => router.visit(box.urls.show)} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Pagination meta={boxes} filters={filters} baseUrl={collectionUrls.cashBoxes} />
            </section>
        </div> : <p className="rounded-panel border border-dashed border-gray-200 bg-surface p-6 text-sm leading-7 text-gray-500">{branchName ? 'لم يُفعّل نظام الصناديق في فرعك بعد. يُفعّله مسؤول الفرع من صفحة الخزنة والكشوفات.' : 'حسابك غير مرتبط بفرع، لذلك لا يوجد سجل صناديق شخصي.'}</p>}
    </AuthenticatedLayout>;
}
