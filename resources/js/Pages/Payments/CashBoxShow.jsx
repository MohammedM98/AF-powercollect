import { useState } from 'react';
import { Head, Link } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Pagination from '@/Components/DataTable/Pagination';
import StatusPill from '@/Components/DataTable/StatusPill';
import PrimaryButton from '@/Components/PrimaryButton';
import Icon from '@/Components/Icon';
import { formatMoney } from '@/lib/format';
import { isPrintMode, printUrl } from '@/lib/print';
import CollectionNavigation from './CollectionNavigation';
import { boxTypes, currencies, dateTime, BoxStage, BoxTotals, CountSummary, CashBoxAction, boxAction, actionLabel } from './CollectorCashBox';

/** A link that looks like the quiet outlined button. */
const linkButton = 'inline-flex items-center justify-center gap-2 rounded-control border border-gray-200 bg-surface px-4 py-2.5 text-sm font-semibold text-gray-900 transition hover:border-gray-300 hover:bg-gray-50';

const entryStatuses = { pending: ['بانتظار التحقق', 'amber'], confirmed: ['مؤكدة', 'green'], missing: ['غير موجودة في البنك', 'red'], rejected: ['مرفوضة', 'red'] };

export default function CashBoxShow({ box, entries, collectionUrls, needsActionCount }) {
    const [showAction, setShowAction] = useState(false);
    const [saved, setSaved] = useState(null);
    const cash = box.type === 'cash';
    const transfer = box.type === 'bank_transfer';
    const action = boxAction(box);
    const columns = ['#', 'التاريخ والوقت', 'المشترك', 'رقم الحساب', ...(cash ? ['رقم السند', 'العملة', 'المبلغ', 'الحالة'] : transfer ? ['البنك المستلم', 'البنك المرسل', 'رقم الحوالة', 'المبلغ ₪', 'التحقق'] : ['الخدمة المقدّمة', 'المبلغ ₪', 'المراجعة'])];
    const printing = isPrintMode();
    const timeline = [['فُتح', box.openedAt], ['أُغلق', box.closedAt], [cash ? 'عدّه الفرع واستلمه' : 'استلمه الفرع', box.receivedAt], ...(cash ? [['تأكيد التسليم', box.confirmedAt]] : [])];

    return <AuthenticatedLayout header={<div><h2 className="text-2xl font-bold text-gray-900">{boxTypes[box.type]}</h2><p dir="ltr" className="mt-1 font-display text-sm text-gray-500">{box.number}</p></div>}>
        <Head title={boxTypes[box.type]} />
        <CollectionNavigation urls={collectionUrls} active="cashBoxes" pendingCount={needsActionCount} />
        <Link href={collectionUrls.cashBoxes} prefetch className="mb-5 inline-block text-sm font-semibold text-brand-600">العودة إلى الصناديق المالية</Link>
        <div className="space-y-6">
            {saved && <p role="status" className="rounded-control bg-emerald-500/10 p-4 text-sm text-emerald-700">{saved}</p>}
            <section className="space-y-5 rounded-panel border border-gray-100 bg-surface p-5 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2"><StatusPill tone={box.status === 'open' ? 'blue' : 'gray'} label={box.status === 'open' ? 'مفتوح' : 'مغلق'} /><BoxStage box={box} /></div><div className="flex flex-wrap items-center gap-2"><a href={printUrl(`تقرير الصندوق ${box.number}`)} target="_blank" rel="noopener noreferrer" className={linkButton}><Icon name="printer" className="h-4 w-4" />طباعة / PDF</a><a href={box.urls.export} className={linkButton}><Icon name="table" className="h-4 w-4" />Excel</a>{action && <PrimaryButton onClick={() => setShowAction(true)}>{actionLabel(box)}</PrimaryButton>}</div></div>
                <ol className="grid gap-3 md:grid-cols-4" aria-label="مراحل الصندوق">{timeline.map(([label, time]) => <li key={label} className={`rounded-control border p-3 ${time ? 'border-brand-500/20 bg-brand-50' : 'border-gray-100 bg-gray-50'}`}><b className="text-sm text-gray-900">{label}</b><p className="mt-1 text-xs text-gray-500">{dateTime(time)}</p></li>)}</ol>
                <p className="text-sm text-gray-600">{box.paymentCount} حركات</p><BoxTotals box={box} />
                {/* The printout reads the page's first table, which must be the entries. */}
                {cash && !printing && <CountSummary box={box} />}
                {printing && <p className="data-table-totals">{`صندوق ${box.number} · ${boxTypes[box.type]} · فُتح ${dateTime(box.openedAt)} · أُغلق ${dateTime(box.closedAt)} · ${box.paymentCount} حركات · الإجمالي ${formatMoney(box.totals?.ILS ?? 0)} شيكل · المستلم ${formatMoney(box.receivedAmounts?.ILS ?? 0)} شيكل${box.closedBy ? ` · أغلقه ${box.closedBy}` : ''}`}</p>}
                {box.reason && <p className="text-sm text-gray-600">سبب فرق العدّ: {box.reason}</p>}
                {box.rejectedCount > 0 && <p className="rounded-control bg-red-500/5 p-3 text-sm leading-7 text-red-700">{box.type === 'clearing' ? 'رفض الفرع بعض المقاصات في هذا الصندوق.' : 'لم يجد الفرع بعض هذه الحوالات في البنك.'} يراجعها مسؤول الفرع وقد يتواصل معك بشأنها؛ لا يلزمك إجراء هنا.</p>}
            </section>
            <section className="space-y-4 rounded-panel border border-gray-100 bg-surface p-5 shadow-card"><h3 className="text-lg font-bold text-gray-900">الحركات</h3><div className="overflow-x-auto"><table className="w-full text-start text-sm"><thead className="bg-gray-50 text-gray-500"><tr>{columns.map((label) => <th key={label} className="whitespace-nowrap p-3 text-start">{label}</th>)}</tr></thead><tbody>{entries.data.map((entry, index) => {
                const active = entry.transactionStatus === 'active';
                const state = entryStatuses[entry.status] ?? ['سارية', 'green'];
                const reviewLabel = box.type === 'clearing' ? entry.status === 'pending' ? 'بانتظار المراجعة' : entry.status === 'confirmed' ? 'مقبولة' : state[0] : state[0];
                return <tr key={entry.id} className={`border-t border-gray-100 ${active ? 'text-gray-700' : 'bg-gray-50 text-gray-400'}`}><td className="p-3 font-display">{entries.from + index}</td><td className="whitespace-nowrap p-3 text-xs">{dateTime(entry.occurredAt)}{entry.isLate && <div className="mt-1"><StatusPill tone="amber" label="متأخرة" /></div>}</td><td className="whitespace-nowrap p-3">{entry.subscriber}</td><td dir="ltr" className="p-3 font-display">{entry.accountNumber}</td>{cash ? <><td dir="ltr" className="p-3 font-display">{entry.voucherNumber ?? '—'}</td><td className="p-3">{currencies[entry.currency]}</td></> : transfer ? <><td className="whitespace-nowrap p-3">{entry.bankName ?? '—'}</td><td className="whitespace-nowrap p-3">{entry.senderBank ?? '—'}</td><td dir="ltr" className="p-3 font-display">{entry.referenceNumber ?? '—'}</td></> : <td className="min-w-48 p-3">{entry.service ?? '—'}</td>}<td dir="ltr" className="p-3 font-display">{formatMoney(entry.amount)}</td><td className="p-3"><StatusPill tone={!active ? 'gray' : state[1]} label={!active ? 'ملغاة' : cash ? 'سارية' : reviewLabel} /></td></tr>;
            })}</tbody></table></div>{entries.total === 0 ? <p className="p-5 text-center text-sm text-gray-500">لا توجد حركات في هذا الصندوق.</p> : <Pagination meta={entries} filters={{}} baseUrl={box.urls.show} />}</section>
        </div>
        {showAction && action && <CashBoxAction box={box} action={action} onClose={() => setShowAction(false)} onSuccess={() => setSaved('تم تأكيد التسليم.')} />}
    </AuthenticatedLayout>;
}
