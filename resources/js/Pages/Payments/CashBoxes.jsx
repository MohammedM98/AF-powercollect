import { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ActionsTh from '@/Components/DataTable/ActionsTh';
import DataTableToolbar from '@/Components/DataTable/DataTableToolbar';
import Pagination from '@/Components/DataTable/Pagination';
import RowIdentity from '@/Components/DataTable/RowIdentity';
import PrimaryButton from '@/Components/PrimaryButton';
import SegmentedTabs from '@/Components/SegmentedTabs';
import { formatMoney } from '@/lib/format';
import CollectionNavigation from './CollectionNavigation';
import {
    boxTypes,
    boxTypeStyles,
    currencies,
    dateTime,
    BoxCard,
    BoxEntriesTable,
    BoxReportActions,
    BoxStage,
    BoxTypeChip,
    BoxTypeIcon,
    CashBoxAction,
    CollectorAuditNotes,
    CollectorDebts,
    boxAction,
    actionLabel,
    pendingCount,
} from './CollectorCashBox';

/** Where each type of box goes when it closes. */
const destinations = { cash: 'خزنة الفرع', bank_transfer: 'حساب البنك', clearing: 'المقاصات' };

/** The dot on a box's tile: green while open, amber while it waits on someone, grey once done. */
const stageDots = { open: 'green', awaiting_branch: 'amber', awaiting_confirmation: 'amber', completed: 'gray' };

const typeFilters = [{ value: '', label: 'الكل' }, ...Object.entries(boxTypeStyles).map(([value, style]) => ({ value, label: style.label }))];
const stateFilters = [{ value: '', label: 'الكل' }, { value: 'open', label: 'مفتوح' }, { value: 'closed', label: 'مغلق' }];

/** A box's amounts by currency, one line each: shekels always, another currency only when it has some. */
function Amounts({ amounts }) {
    const shown = Object.keys(currencies).filter((currency) => currency === 'ILS' || Number(amounts?.[currency] ?? 0) !== 0);

    return shown.map((currency) => (
        <span key={currency} className="block whitespace-nowrap">
            <b dir="ltr" className="font-display">{formatMoney(amounts?.[currency] ?? 0)}</b> <span className="text-xs text-gray-500">{currencies[currency]}</span>
        </span>
    ));
}

/** The currencies a box holds, by name. */
function heldCurrencies(box) {
    const held = Object.keys(currencies).filter((currency) => Number(box.totals?.[currency] ?? 0) !== 0);

    return (held.length ? held : ['ILS']).map((currency) => currencies[currency]).join('، ');
}

/**
 * The entries of the open box picked on the cards or the tabs, newest
 * first, so the collector sees every payment, transfer and clearing they
 * recorded since it opened.
 */
function OpenBoxEntries({ current, openBox, onSelect, pagination }) {
    const box = current[openBox.type];

    return (
        <section aria-labelledby="open-box-entries" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <BoxTypeIcon type={openBox.type} className="h-10 w-10" />
                    <div>
                        <h3 id="open-box-entries" className="text-lg font-bold text-gray-900">حركات {boxTypes[openBox.type]} المفتوح</h3>
                        <p className="text-xs text-gray-500">
                            {box ? <>صندوق رقم <bdi dir="ltr" className="font-display">{box.number}</bdi> · {box.paymentCount} حركات · الإجمالي <bdi dir="ltr" className="font-display">{formatMoney(box.totals?.ILS ?? 0)}</bdi> شيكل</> : 'لا يوجد صندوق مفتوح من هذا النوع الآن.'}
                        </p>
                    </div>
                </div>
                <SegmentedTabs
                    label="نوع الصندوق المفتوح"
                    value={openBox.type}
                    onChange={onSelect}
                    options={Object.entries(boxTypeStyles).map(([value, style]) => ({ value, label: `${style.label}${current[value] ? ` (${current[value].paymentCount})` : ''}` }))}
                />
            </div>
            {openBox.entries ? (
                <BoxEntriesTable type={openBox.type} entries={openBox.entries} pagination={pagination} />
            ) : (
                <p className="rounded-panel border border-dashed border-gray-200 bg-surface px-5 py-8 text-center text-sm text-gray-500">يُفتح الصندوق تلقائيًا عند تسجيل أول حركة من هذا النوع، وتظهر حركاته هنا.</p>
            )}
        </section>
    );
}

/**
 * The collector's financial boxes: the ones open now with every entry in
 * them, what waits on them (a handover to confirm, an audit note to
 * answer, a debt), and every box they had in the site's table, each with
 * its type, totals, dates, where and by whom it was closed, its details
 * and its report to print or download.
 */
export default function CashBoxes({ cashBox, current, openBox, needsAction, boxes, filters, collectionUrls }) {
    const [selected, setSelected] = useState(null);
    const [saved, setSaved] = useState(null);
    const visitOptions = { preserveState: true, preserveScroll: true, replace: true };

    function filter(key, value) {
        router.get(collectionUrls.cashBoxes, { ...filters, open: openBox.type, [key]: value }, visitOptions);
    }

    function showOpenBox(type) {
        router.get(collectionUrls.cashBoxes, { ...filters, page: boxes.current_page, open: type }, { ...visitOptions, only: ['openBox'] });
    }

    return <AuthenticatedLayout header={<div><p className="text-sm font-semibold text-gray-500">{cashBox.branchName ?? 'حسابك الحالي'}</p><h2 className="mt-1 text-3xl font-bold text-gray-900">الصناديق المالية</h2></div>}>
        <Head title="الصناديق المالية" />
        <CollectionNavigation urls={collectionUrls} active="cashBoxes" pendingCount={pendingCount(cashBox)} />
        {saved && <p role="status" className="mb-4 rounded-control bg-emerald-500/10 p-4 text-sm text-emerald-700">{saved}</p>}
        {cashBox.started ? <div className="space-y-8">
            <section aria-labelledby="open-boxes" className="space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 id="open-boxes" className="text-lg font-bold text-gray-900">صناديقي المفتوحة</h3>
                    <p className="text-xs text-gray-500">لكل نوع صندوق خاص به؛ يغلقه الفرع عند الاستلام أو عند القطع الأسبوعي.</p>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                    {Object.keys(boxTypes).map((type) => <BoxCard key={type} type={type} box={current[type]} selected={openBox.type === type && Boolean(current[type])} onSelect={() => showOpenBox(type)} />)}
                </div>
            </section>

            <OpenBoxEntries
                current={current}
                openBox={openBox}
                onSelect={showOpenBox}
                pagination={{ filters: { ...filters, open: openBox.type }, baseUrl: collectionUrls.cashBoxes, extraParams: { page: boxes.current_page }, pageParam: 'entries_page' }}
            />

            {needsAction.length > 0 && <section className="space-y-3 rounded-panel border border-amber-500/25 bg-amber-500/5 p-5">
                <h3 className="font-bold text-gray-900">تحتاج إجراء منك</h3>
                {needsAction.map((box) => <div key={box.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-500/15 pt-3"><div className="flex items-center gap-3"><BoxTypeIcon type={box.type} className="h-10 w-10" /><div className="space-y-2"><Link href={box.urls.show} prefetch className="font-semibold text-gray-900">{boxTypes[box.type]} · <bdi dir="ltr" className="font-display text-xs">{box.number}</bdi></Link><BoxStage box={box} /></div></div><PrimaryButton onClick={() => setSelected({ box, action: boxAction(box) })}>{actionLabel(box)}</PrimaryButton></div>)}
            </section>}
            <CollectorAuditNotes notes={cashBox.auditNotes} onSaved={() => setSaved('أُرسل ردّك إلى الفرع.')} />
            <CollectorDebts debts={cashBox.debts} />

            <section aria-labelledby="all-boxes" className="space-y-4">
                <h3 id="all-boxes" className="text-lg font-bold text-gray-900">كل صناديقي</h3>
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
                    <table className="data-table w-full text-start text-sm">
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
                <Pagination meta={boxes} filters={filters} baseUrl={collectionUrls.cashBoxes} extraParams={{ open: openBox.type }} />
            </section>
        </div> : <p className="rounded-panel border border-dashed border-gray-200 bg-surface p-6 text-sm leading-7 text-gray-500">{cashBox.branchName ? 'لم يُفعّل نظام الصناديق في فرعك بعد. يُفعّله مسؤول الفرع من صفحة الإغلاق.' : 'حسابك غير مرتبط بفرع، لذلك لا يوجد سجل صناديق شخصي.'}</p>}
        {selected && <CashBoxAction key={`${selected.box.id}-${selected.action}`} {...selected} onClose={() => setSelected(null)} onSuccess={() => setSaved('تم تأكيد التسليم.')} />}
    </AuthenticatedLayout>;
}
