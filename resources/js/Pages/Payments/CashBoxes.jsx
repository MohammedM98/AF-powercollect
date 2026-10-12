import { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Pagination from '@/Components/DataTable/Pagination';
import StatusPill from '@/Components/DataTable/StatusPill';
import PrimaryButton from '@/Components/PrimaryButton';
import CollectionNavigation from './CollectionNavigation';
import CollectorCashBox, { boxTypes, dateTime, BoxStage, BoxTotals, CashBoxAction, boxAction, actionLabel } from './CollectorCashBox';

export default function CashBoxes({ cashBox, current, needsAction, boxes, filters, collectionUrls }) {
    const [selected, setSelected] = useState(null);
    const [saved, setSaved] = useState(null);
    function filter(key, value) {
        router.get(collectionUrls.cashBoxes, { ...filters, [key]: value }, { preserveState: true, preserveScroll: true, replace: true });
    }

    return <AuthenticatedLayout header={<div><p className="text-sm font-semibold text-gray-500">{cashBox.branchName ?? 'حسابك الحالي'}</p><h2 className="mt-1 text-3xl font-bold text-gray-900">صناديقي</h2></div>}>
        <Head title="صناديقي" />
        <CollectionNavigation urls={collectionUrls} active="cashBoxes" pendingCount={needsAction.length} />
        {saved && <p role="status" className="mb-4 rounded-control bg-emerald-500/10 p-4 text-sm text-emerald-700">{saved}</p>}
        {cashBox.started ? <div className="space-y-6">
            <CollectorCashBox cashBox={{ ...cashBox, current }} />
            {needsAction.length > 0 && <section className="space-y-3 rounded-panel border border-amber-500/25 bg-amber-500/5 p-5">
                <h3 className="font-bold text-gray-900">تحتاج إجراء منك</h3>
                {needsAction.map((box) => <div key={box.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-500/15 pt-3"><div className="space-y-2"><Link href={box.urls.show} prefetch className="font-semibold text-gray-900">{boxTypes[box.type]} · <span dir="ltr" className="font-display text-xs">{box.number}</span></Link><BoxStage box={box} /></div><PrimaryButton onClick={() => setSelected({ box, action: boxAction(box) })}>{actionLabel(box)}</PrimaryButton></div>)}
            </section>}
            <section className="space-y-4 rounded-panel border border-gray-100 bg-surface p-5 shadow-card">
                <h3 className="text-lg font-bold text-gray-900">كل صناديقي</h3>
                <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2" role="group" aria-label="نوع الصندوق">{[['', 'الكل'], ['cash', 'نقدي'], ['bank_transfer', 'حوالات'], ['clearing', 'مقاصات']].map(([key, label]) => <button key={key} type="button" aria-pressed={filters.type === key} onClick={() => filter('type', key)} className={`rounded-control px-3 py-2 text-sm font-semibold ${filters.type === key ? 'bg-gray-900 text-surface' : 'bg-gray-50 text-gray-600'}`}>{label}</button>)}</div><label className="flex items-center gap-2 text-sm text-gray-600">الحالة<select value={filters.state} onChange={(event) => filter('state', event.target.value)} className="rounded-control border-gray-200 text-sm"><option value="">الكل</option><option value="open">مفتوح</option><option value="closed">مغلق</option></select></label></div>
                <div className="overflow-x-auto"><table className="w-full text-start text-sm"><thead className="bg-gray-50 text-gray-500"><tr>{['رقم الصندوق', 'النوع', 'الحالة', 'المرحلة', 'فُتح', 'أُغلق', 'الحركات', 'المجموع', ''].map((label) => <th key={label} className="whitespace-nowrap p-3 text-start">{label}</th>)}</tr></thead><tbody>{boxes.data.map((box) => <tr key={box.id} className="border-t border-gray-100 text-gray-700"><td className="p-3"><Link href={box.urls.show} prefetch dir="ltr" className="font-display text-xs text-brand-600">{box.number}</Link></td><td className="whitespace-nowrap p-3">{boxTypes[box.type]}</td><td className="p-3"><StatusPill tone={box.status === 'open' ? 'blue' : 'gray'} label={box.status === 'open' ? 'مفتوح' : 'مغلق'} /></td><td className="p-3"><BoxStage box={box} /></td><td className="whitespace-nowrap p-3 text-xs">{dateTime(box.openedAt)}</td><td className="whitespace-nowrap p-3 text-xs">{dateTime(box.closedAt)}</td><td className="p-3 font-display">{box.paymentCount}</td><td className="min-w-40 p-3"><BoxTotals box={box} /></td><td className="p-3"><Link href={box.urls.show} prefetch className="text-brand-600">فتح</Link></td></tr>)}</tbody></table></div>
                {boxes.total === 0 ? <p className="p-5 text-center text-sm text-gray-500">لا توجد صناديق بهذه الفلاتر.</p> : <Pagination meta={boxes} filters={filters} baseUrl={collectionUrls.cashBoxes} />}
            </section>
        </div> : <p className="rounded-panel border border-dashed border-gray-200 bg-surface p-6 text-sm leading-7 text-gray-500">{cashBox.branchName ? 'لم يُفعّل نظام الصناديق في فرعك بعد. يُفعّله مسؤول الفرع من صفحة الإغلاق.' : 'حسابك غير مرتبط بفرع، لذلك لا يوجد سجل صناديق شخصي.'}</p>}
        {selected && <CashBoxAction key={`${selected.box.id}-${selected.action}`} {...selected} onClose={() => setSelected(null)} onSuccess={() => setSaved(selected.action === 'confirm' ? 'تم تأكيد التسليم.' : 'تم إرسال الصندوق إلى الفرع.')} />}
    </AuthenticatedLayout>;
}
