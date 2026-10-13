import { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ActionsTh from '@/Components/DataTable/ActionsTh';
import ColumnWidths, { fixedTableStyle } from '@/Components/DataTable/ColumnWidths';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import StatusPill from '@/Components/DataTable/StatusPill';
import Icon from '@/Components/Icon';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import SegmentedTabs from '@/Components/SegmentedTabs';
import { formatMoney } from '@/lib/format';
import BoxDetails, { boxStatuses } from '../Closings/BoxDetails';
import { periodLabel } from '../Closings/ClosingComponents';
import CashBoxTabs from './CashBoxTabs';
import CollectionNavigation from './CollectionNavigation';
import { boxTypes, boxTypeStyles, currencies, dateTime, Amounts } from './CollectorCashBox';

/** The dot on a box's tile: green while open, amber while it waits on the branch, grey once confirmed. */
const statusDots = { open: 'green', pending: 'amber', received: 'gray' };

/** The table's column widths, in its column order; the person's column takes what is left. */
const columnWidths = [200, null, 70, 150, 150, 170, 150];

/** A box's active entries added up by currency. */
function boxTotals(box) {
    const active = box.payments.filter((entry) => !entry.transaction || entry.transaction.status === 'active');

    return Object.fromEntries(Object.keys(currencies).map((currency) => [currency, active.filter((entry) => entry.currency === currency).reduce((sum, entry) => sum + Number(entry.amount), 0)]));
}

/** Whether the actor can confirm this box closed now. */
function closable(box) {
    return box.canCount && box.kind !== 'direct' && ['open', 'pending'].includes(box.status);
}

/**
 * The financial boxes page's staff tab, for those who close the branch's
 * boxes: every box of the branch's people, waiting ones first, each opened
 * to review its entries, send any back to its collector and confirm it
 * closed. The safe, the weekly statements and the audit notes are on the
 * safe and statements page.
 */
export default function BranchCashBoxes({ branch, branches, started, boxes, closings, access, pendingCount, collectionUrls, urls }) {
    const { can, errors } = usePage().props;
    const pending = boxes.filter((box) => box.status === 'pending');
    const [status, setStatus] = useState(pending.length ? 'pending' : 'all');
    const [search, setSearch] = useState('');
    const [boxId, setBoxId] = useState(null);
    const selectedBox = boxes.find((box) => box.id === boxId);
    const shown = boxes.filter((box) => (status === 'all' || box.status === status) && `${box.number} ${box.user?.name ?? 'الدفعات المباشرة'}`.includes(search.trim()));
    const rejected = boxes.flatMap((box) => box.payments.filter((entry) => ['missing', 'rejected'].includes(entry.status) && entry.transaction?.status === 'active').map((entry) => ({ ...entry, box })));
    const statusFilters = [['pending', 'بانتظار الإغلاق'], ['open', 'مفتوحة'], ['received', 'مؤكدة'], ['all', 'الكل']].map(([value, label]) => ({ value, label: `${label} · ${value === 'all' ? boxes.length : boxes.filter((box) => box.status === value).length}` }));

    function perform(kind, record, extra = {}) {
        router.post(`${urls.actions}/${kind}/${record.id}`, { branch_id: branch.id, ...extra }, { preserveScroll: true });
    }

    return <AuthenticatedLayout header={<div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-gray-500">{branches.length > 1 ? <select aria-label="الفرع" className="rounded-control border-gray-200 py-1 text-sm" value={branch.id} onChange={(event) => router.get(urls.index, { branch_id: event.target.value })}>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : branch.name}</p><h2 className="mt-1 text-3xl font-bold text-gray-900">الصناديق المالية</h2></div><CashBoxTabs urls={collectionUrls} active="branch" branchPendingCount={pending.length} /></div>}>
        <Head title="صناديق الموظفين" />
        {can.viewOwnCashBoxes && <CollectionNavigation urls={collectionUrls} active="cashBoxes" pendingCount={pendingCount} />}
        {!started ? <p className="rounded-panel border border-dashed border-gray-200 bg-surface p-6 text-sm leading-7 text-gray-500">لم يُفعّل نظام الصناديق في هذا الفرع بعد. {access.manage ? <>ابدأه من <Link href={urls.reconciliation} className="font-semibold text-brand-600">صفحة الخزنة والكشوفات</Link>.</> : 'يُفعّله مسؤول الفرع من صفحة الخزنة والكشوفات.'}</p> : <div className="space-y-4">
            {errors?.action && <p role="alert" className="rounded-control bg-red-500/10 p-4 text-sm text-red-700">{errors.action}</p>}
            {access.manage && rejected.length > 0 && <section aria-label="حركات مرفوضة" className="space-y-2 rounded-panel border border-gray-100 bg-surface p-5 shadow-card">
                <h3 className="font-bold text-gray-900">حركات مرفوضة</h3>
                <p className="text-sm text-gray-500">راجع الحركات وصحّحها من حساب المشترك عند الحاجة.</p>
                {rejected.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-red-500/5 p-3 text-sm">
                    <span>{boxTypes[entry.box.type]} · {entry.transaction?.subscription?.subscription_name || entry.transaction?.subscription?.full_name} · {entry.method === 'clearing' ? entry.transaction?.notes : entry.transaction?.reference_number}</span>
                    <b dir="ltr" className="font-display">{formatMoney(entry.amount)} <span className="text-xs font-normal text-gray-500">{currencies[entry.currency]}</span></b>
                    <div className="flex flex-wrap items-center gap-3"><SecondaryButton onClick={() => setBoxId(entry.box.id)}>مراجعة</SecondaryButton><Link href={entry.statement_url} prefetch className="font-semibold text-brand-600">حساب المشترك</Link></div>
                </div>)}
            </section>}
            <section aria-label="صناديق الموظفين" className="space-y-4">
                <div className="data-table-toolbar flex flex-wrap items-center justify-between gap-3">
                    <div className="relative w-full sm:max-w-sm">
                        <Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-gray-400" />
                        <input type="text" aria-label="ابحث باسم الموظف أو رقم الصندوق" placeholder="ابحث باسم الموظف أو رقم الصندوق" value={search} onChange={(event) => setSearch(event.target.value)} className="block w-full py-2.5 pe-4 ps-10 text-sm" />
                    </div>
                    <SegmentedTabs label="حالة الصندوق" value={status} onChange={setStatus} options={statusFilters} />
                </div>
                <div className="data-table-container">
                    <table className="data-table data-table-fixed w-full text-start text-sm" style={fixedTableStyle(columnWidths)}>
                        <ColumnWidths widths={columnWidths} />
                        <thead>
                            <tr>
                                <th>الصندوق</th>
                                <th>الموظف</th>
                                <th>الحركات</th>
                                <th>الإجمالي</th>
                                <th>فُتح ← أُغلق</th>
                                <th>الحالة</th>
                                <ActionsTh />
                            </tr>
                        </thead>
                        <tbody>
                            {shown.length === 0 ? (
                                <tr><td colSpan={7} className="text-center text-gray-500">لا توجد صناديق بهذه الفلاتر.</td></tr>
                            ) : shown.map((box) => (
                                <tr key={box.id}>
                                    <td><RowIdentity icon={boxTypeStyles[box.type].icon} name={`صندوق ${box.number}`} subtitle={`${boxTypeStyles[box.type].label} · ${periodLabel(closings.find((closing) => closing.id === box.closing_id))}`} status={statusDots[box.status]} /></td>
                                    <td className="text-gray-700" title={box.user?.name ?? 'الدفعات المباشرة'}>{box.user?.name ?? 'الدفعات المباشرة'}</td>
                                    <td className="font-display text-gray-600">{box.payments.length}</td>
                                    <td><Amounts amounts={boxTotals(box)} /></td>
                                    <td className="text-xs text-gray-600">{dateTime(box.opened_at)}<span className="block">{box.closed_at ? dateTime(box.closed_at) : <span className="text-gray-400">لا يزال مفتوحًا</span>}</span></td>
                                    <td><StatusPill tone={boxStatuses[box.status][1]} label={boxStatuses[box.status][0]} />{box.status === 'received' && !box.confirmed_at && <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">ينتظر تأكيد المحصّل</span>}</td>
                                    <td className="text-end">{closable(box) ? <PrimaryButton onClick={() => setBoxId(box.id)} className="px-3 py-1.5">مراجعة وإغلاق</PrimaryButton> : <SecondaryButton onClick={() => setBoxId(box.id)} className="px-3 py-1.5">عرض الصندوق</SecondaryButton>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>}
        {selectedBox && <BoxDetails box={selectedBox} access={access} onClose={() => setBoxId(null)} perform={perform} period={periodLabel(closings.find((closing) => closing.id === selectedBox.closing_id))} />}
    </AuthenticatedLayout>;
}
