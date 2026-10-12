import { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Pagination from '@/Components/DataTable/Pagination';
import Icon from '@/Components/Icon';
import PrimaryButton from '@/Components/PrimaryButton';
import { formatMoney } from '@/lib/format';
import { printUrl } from '@/lib/print';
import CollectionNavigation from './CollectionNavigation';
import CollectorCashBox, { boxTypes, currencies, dateTime, BoxStage, CashBoxAction, CollectorAuditNotes, CollectorDebts, boxAction, actionLabel, pendingCount } from './CollectorCashBox';

/** Where each type of box goes when it closes. */
const destinations = { cash: 'خزنة الفرع', bank_transfer: 'حساب البنك', clearing: 'المقاصات' };

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

/** The box's report: printed (or saved as PDF) from the print designer, or downloaded as a spreadsheet. */
function BoxReport({ box }) {
    return (
        <div className="inline-flex items-center gap-1.5">
            <a href={printUrl(`تقرير الصندوق ${box.number}`, box.urls.show)} target="_blank" rel="noopener noreferrer" title="طباعة / PDF" aria-label={`طباعة الصندوق ${box.number}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white shadow-card transition hover:brightness-110">
                <Icon name="printer" className="h-4 w-4" />
            </a>
            <a href={box.urls.export} title="Excel" aria-label={`تنزيل الصندوق ${box.number} كملف Excel`} className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-600 text-white shadow-card transition hover:brightness-110">
                <Icon name="table" className="h-4 w-4" />
            </a>
        </div>
    );
}

/**
 * The collector's financial boxes: the ones open now, what waits on them
 * (a handover to confirm, an audit note to answer, a debt), and every box
 * they had, each with its totals, dates, where and by whom it was closed,
 * and its report to print or download.
 */
export default function CashBoxes({ cashBox, current, needsAction, boxes, filters, collectionUrls }) {
    const [selected, setSelected] = useState(null);
    const [saved, setSaved] = useState(null);
    function filter(key, value) {
        router.get(collectionUrls.cashBoxes, { ...filters, [key]: value }, { preserveState: true, preserveScroll: true, replace: true });
    }

    return <AuthenticatedLayout header={<div><p className="text-sm font-semibold text-gray-500">{cashBox.branchName ?? 'حسابك الحالي'}</p><h2 className="mt-1 text-3xl font-bold text-gray-900">الصناديق المالية</h2></div>}>
        <Head title="الصناديق المالية" />
        <CollectionNavigation urls={collectionUrls} active="cashBoxes" pendingCount={pendingCount(cashBox)} />
        {saved && <p role="status" className="mb-4 rounded-control bg-emerald-500/10 p-4 text-sm text-emerald-700">{saved}</p>}
        {cashBox.started ? <div className="space-y-6">
            <CollectorCashBox cashBox={{ ...cashBox, current }} />
            {needsAction.length > 0 && <section className="space-y-3 rounded-panel border border-amber-500/25 bg-amber-500/5 p-5">
                <h3 className="font-bold text-gray-900">تحتاج إجراء منك</h3>
                {needsAction.map((box) => <div key={box.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-500/15 pt-3"><div className="space-y-2"><Link href={box.urls.show} prefetch className="font-semibold text-gray-900">{boxTypes[box.type]} · <span dir="ltr" className="font-display text-xs">{box.number}</span></Link><BoxStage box={box} /></div><PrimaryButton onClick={() => setSelected({ box, action: boxAction(box) })}>{actionLabel(box)}</PrimaryButton></div>)}
            </section>}
            <CollectorAuditNotes notes={cashBox.auditNotes} onSaved={() => setSaved('أُرسل ردّك إلى الفرع.')} />
            <CollectorDebts debts={cashBox.debts} />
            <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-bold text-gray-900">كل صناديقي</h3>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex flex-wrap gap-2" role="group" aria-label="نوع الصندوق">{[['', 'الكل'], ['cash', 'نقدي'], ['bank_transfer', 'حوالات'], ['clearing', 'مقاصات']].map(([key, label]) => <button key={key} type="button" aria-pressed={filters.type === key} onClick={() => filter('type', key)} className={`rounded-control px-3 py-2 text-sm font-semibold ${filters.type === key ? 'bg-gray-900 text-surface' : 'bg-gray-50 text-gray-600'}`}>{label}</button>)}</div>
                        <label className="flex items-center gap-2 text-sm text-gray-600">الحالة<select value={filters.state} onChange={(event) => filter('state', event.target.value)} className="rounded-control border-gray-200 text-sm"><option value="">الكل</option><option value="open">مفتوح</option><option value="closed">مغلق</option></select></label>
                    </div>
                </div>
                <div className="data-table-container">
                    <table className="data-table w-full text-start text-sm">
                        <thead>
                            <tr>
                                <th>#</th>
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
                                {/* `data-actions` keeps the report buttons out of the page's own printout. */}
                                <th data-actions="">تقرير الصندوق</th>
                            </tr>
                        </thead>
                        <tbody>
                            {boxes.data.length === 0 ? (
                                <tr><td colSpan={13} className="text-center text-gray-500">لا توجد صناديق بهذه الفلاتر.</td></tr>
                            ) : boxes.data.map((box, index) => (
                                <tr key={box.id}>
                                    <td className="font-display text-gray-500">{boxes.from + index}</td>
                                    <td><Link href={box.urls.show} prefetch dir="ltr" className="font-display font-bold text-brand-600">{box.number}</Link></td>
                                    <td className="whitespace-nowrap">{boxTypes[box.type]}</td>
                                    <td className="whitespace-nowrap">{heldCurrencies(box)}</td>
                                    <td className="font-display">{box.paymentCount}</td>
                                    <td><Amounts amounts={box.totals} /></td>
                                    <td><Amounts amounts={box.receivedAmounts} /></td>
                                    <td className="whitespace-nowrap text-xs">{dateTime(box.openedAt)}</td>
                                    <td className="whitespace-nowrap text-xs">{box.closedAt ? dateTime(box.closedAt) : <span className="text-gray-400">لا يزال مفتوحًا</span>}</td>
                                    <td className="whitespace-nowrap">{box.status === 'open' ? '—' : <>{destinations[box.type]}{box.settledIn && <span className="block text-xs text-gray-500">أسبوع <bdi dir="ltr">{box.settledIn.start}</bdi></span>}</>}</td>
                                    <td><BoxStage box={box} /></td>
                                    <td className="whitespace-nowrap">{box.closedBy ?? '—'}</td>
                                    <td className="text-end"><BoxReport box={box} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {boxes.total > 0 && <Pagination meta={boxes} filters={filters} baseUrl={collectionUrls.cashBoxes} />}
            </section>
        </div> : <p className="rounded-panel border border-dashed border-gray-200 bg-surface p-6 text-sm leading-7 text-gray-500">{cashBox.branchName ? 'لم يُفعّل نظام الصناديق في فرعك بعد. يُفعّله مسؤول الفرع من صفحة الإغلاق.' : 'حسابك غير مرتبط بفرع، لذلك لا يوجد سجل صناديق شخصي.'}</p>}
        {selected && <CashBoxAction key={`${selected.box.id}-${selected.action}`} {...selected} onClose={() => setSelected(null)} onSuccess={() => setSaved('تم تأكيد التسليم.')} />}
    </AuthenticatedLayout>;
}
