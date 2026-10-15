import { useEffect, useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import SecondaryButton from '@/Components/SecondaryButton';
import SegmentedTabs from '@/Components/SegmentedTabs';
import { formatMoney } from '@/lib/format';
import { boxPersonName, financialBoxesTotals, filterFinancialBoxes, sortFinancialBoxes } from '@/lib/financialBoxes';
import BoxDetails from '../Closings/BoxDetails';
import { periodLabel, periodRange } from '../Closings/ClosingComponents';
import CollectionNavigation from './CollectionNavigation';
import StatusGuide from './StatusGuide';
import FinancialBoxList from './FinancialBoxList';
import { boxTypes, boxTypeStyles, currencies } from './CollectorCashBox';
import { FinancialBoxCard, FinancialBoxSummary, financialAmountsLine } from './FinancialBoxComponents';

function savedPreference(key, fallback, allowed) {
    try {
        const value = localStorage.getItem(`financial-boxes:${key}`);
        return allowed.includes(value) ? value : fallback;
    } catch {
        return fallback;
    }
}

/** The branch's financial boxes, in the site's table (whose box each is in its own column) or as cards. */
export default function BranchCashBoxes({ branch, branches, started, boxes, closings, access, pendingCount, collectionUrls, urls }) {
    const { can, errors } = usePage().props;
    const pending = boxes.filter((box) => box.status === 'pending');
    const [chosenStatus, setStatus] = useState(pending.length ? 'pending' : 'all');
    // Confirming the last box waiting for its close keeps the page's state, so
    // the filter falls back to every box rather than stay on an empty list.
    const status = chosenStatus === 'pending' && !pending.length ? 'all' : chosenStatus;
    const [search, setSearch] = useState('');
    const [person, setPerson] = useState('');
    const [view, setView] = useState(() => savedPreference('view', 'table', ['table', 'cards']));
    const [sort, setSort] = useState({ key: 'status', direction: 'asc' });
    const [followup, setFollowup] = useState(null);
    const [boxId, setBoxId] = useState(() => Number(new URLSearchParams(window.location.search).get('box')) || null);
    const selectedBox = boxes.find((box) => box.id === boxId);
    const people = [...new Map(boxes.filter((box) => box.user).map((box) => [box.user.id, box.user.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar'));
    const shown = filterFinancialBoxes(boxes, { status, person, search });
    const active = (entry) => !entry.transaction || entry.transaction.status === 'active';
    const rejected = boxes.flatMap((box) => box.payments.filter((entry) => ['missing', 'rejected'].includes(entry.status) && active(entry)).map((entry) => ({ ...entry, box })));
    const currentClosing = closings.find((closing) => new Date(closing.coverage_from) <= new Date() && new Date(closing.coverage_until) >= new Date());
    const statusFilters = [['pending', 'بانتظار تأكيد الإغلاق'], ['open', 'مفتوحة'], ['received', 'مغلقة'], ['all', 'الكل']].map(([value, label]) => ({ value, label: <>{label} · <span className="font-display">{value === 'all' ? boxes.length : boxes.filter((box) => box.status === value).length}</span></> }));
    const sortState = { sort: sort.key, direction: sort.direction };
    const boxPeriod = (box) => periodLabel(closings.find((closing) => closing.id === box.closing_id));

    useEffect(() => {
        try {
            localStorage.setItem('financial-boxes:view', view);
        } catch {
            return;
        }
    }, [view]);

    function closeBox() {
        setBoxId(null);
        const url = new URL(window.location.href);
        url.searchParams.delete('box');
        window.history.replaceState(window.history.state, '', url);
    }

    function perform(kind, record, extra = {}) {
        router.post(`${urls.actions}/${kind}/${record.id}`, { branch_id: branch.id, ...extra }, { preserveScroll: true });
    }

    function sortBy(key) {
        setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
    }

    const attentionCards = [
        { key: 'rejected', icon: 'alert', label: 'الحركات المرفوضة', count: rejected.length, hint: rejected.length ? `في ${new Set(rejected.map((entry) => entry.box.id)).size} صناديق` : 'لا حركات مرفوضة', tone: 'bg-brand-500/10 text-brand-600' },
    ];

    return <AuthenticatedLayout header={<div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-gray-500">{branches.length > 1 ? <select aria-label="الفرع" className="rounded-control border-gray-200 py-1 text-sm" value={branch.id} onChange={(event) => router.get(urls.index, { branch_id: event.target.value })}>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : branch.name}</p><h2 className="mt-1 text-3xl font-bold text-gray-900">الصناديق المالية</h2></div>{currentClosing && <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-surface px-3 py-1.5 text-sm text-gray-600"><Icon name="calendar" className="h-4 w-4" />{periodRange(currentClosing)}</span>}</div>}>
        <Head title="الصناديق المالية" />
        {can.viewOwnCashBoxes && <CollectionNavigation urls={collectionUrls} active="cashBoxes" pendingCount={pendingCount} className="flex-wrap" />}
        {!started ? <p className="rounded-panel border border-dashed border-gray-200 bg-surface p-6 text-sm leading-7 text-gray-500">لم يُفعّل نظام الصناديق في هذا الفرع بعد. {access.manage ? <>ابدأه من <Link href={urls.reconciliation} className="font-semibold text-brand-600">صفحة الإغلاقات والكشوفات</Link>.</> : 'يُفعّله مسؤول الفرع من صفحة الإغلاقات والكشوفات.'}</p> : <div className="financial-boxes financial-surface space-y-5">
            {errors?.action && <p role="alert" className="rounded-control bg-red-500/10 p-4 text-sm text-red-700">{errors.action}</p>}
            <FinancialBoxSummary boxes={boxes} />
            <StatusGuide />
            {access.manage && <section aria-label="بانتظار المتابعة" className="flex flex-wrap gap-3">{attentionCards.map((item) => <button key={item.key} type="button" onClick={() => setFollowup(item.key)} className="group flex min-w-0 items-center gap-3 rounded-card border border-gray-100 bg-surface p-3 pe-4 sm:min-w-[320px] text-start shadow-card transition hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 motion-reduce:transform-none motion-reduce:transition-none"><span className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.count ? item.tone : 'bg-gray-100 text-gray-400'}`}><Icon name={item.count ? item.icon : 'check'} className="h-5 w-5" />{item.count > 0 && <span className="absolute -end-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 font-display text-[11px] font-bold text-white ring-2 ring-surface">{item.count}</span>}</span><span className="min-w-0 flex-1"><span className={`block text-sm font-semibold ${item.count ? 'text-gray-900' : 'text-gray-500'}`}>{item.label}</span><span className="block truncate text-xs text-gray-500">{item.hint}</span></span><Icon name="chevron-left" className="h-4 w-4 text-gray-300 transition group-hover:text-gray-600" /></button>)}</section>}
            <section aria-label="الصناديق المالية">
                <div className="data-table-toolbar flex flex-wrap items-center justify-between gap-3">
                    <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                        <div className="relative w-full sm:w-72"><Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-gray-400" /><input type="text" aria-label="ابحث باسم الموظف أو رقم الصندوق" placeholder="ابحث باسم الموظف أو رقم الصندوق" value={search} onChange={(event) => setSearch(event.target.value)} className="block w-full py-2.5 pe-4 ps-10 text-sm" /></div>
                        <select aria-label="الموظف" value={person} onChange={(event) => setPerson(event.target.value)} className="w-full py-2.5 text-sm sm:w-56"><option value="">كل الموظفين</option>{people.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}</select>
                    </div>
                    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                        <SegmentedTabs label="حالة الصندوق" value={status} onChange={setStatus} options={statusFilters} />
                        <SegmentedTabs label="طريقة العرض" value={view} onChange={setView} options={[{ value: 'table', label: <><Icon name="table" className="h-4 w-4" />جدول</> }, { value: 'cards', label: <><Icon name="grid" className="h-4 w-4" />بطاقات</> }]} />
                    </div>
                </div>
                <div className="data-table-container financial-box-list-container">
                    {!shown.length ? <div className="flex flex-col items-center gap-2 px-4 py-14 text-center text-gray-500"><Icon name="wallet" className="h-8 w-8 text-gray-400" /><p>لا توجد صناديق بهذه الفلاتر.</p></div> : view === 'cards' ? <div className="grid gap-4 py-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{sortFinancialBoxes(shown, sort).map((box) => <FinancialBoxCard key={box.id} box={box} period={boxPeriod(box)} onOpen={(item) => setBoxId(item.id)} />)}</div> : <FinancialBoxList boxes={sortFinancialBoxes(shown, sort)} onOpen={(box) => setBoxId(box.id)} periodFor={boxPeriod} sortState={sortState} onSort={sortBy} />}
                </div>
                <p className="data-table-totals text-sm text-gray-600"><span>المعروض <b className="font-display text-gray-900">{shown.length}</b> من <b className="font-display text-gray-900">{boxes.length}</b> صندوقًا</span><span>مجموع الصناديق المعروضة: <b className="font-display text-gray-900">{financialAmountsLine(financialBoxesTotals(shown))}</b></span></p>
            </section>
        </div>}
        {followup && <Modal show onClose={() => setFollowup(null)} maxWidth="full" panelClassName="financial-box-followup flex flex-col">
            <header className="flex items-center justify-between gap-3 border-b border-gray-100 p-6"><div><h2 className="text-xl font-bold text-gray-900">الحركات المرفوضة</h2><p className="mt-1 text-sm text-gray-500">راجع الحركات وصحّحها من حساب المشترك عند الحاجة.</p></div><button type="button" onClick={() => setFollowup(null)} aria-label="إغلاق المتابعة" className="rounded-control p-2 text-gray-500 hover:bg-gray-100"><Icon name="close" className="h-5 w-5" /></button></header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gray-50 p-5">{!rejected.length ? <p className="py-10 text-center text-sm text-gray-500">لا توجد حركات تنتظر المتابعة.</p> : rejected.map((entry) => <article key={entry.id} className="space-y-3 rounded-2xl border border-gray-100 bg-surface p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-gray-900">{entry.transaction?.subscription?.subscription_name || entry.transaction?.subscription?.full_name || '—'}</p><p className="text-xs text-gray-500">{boxTypes[entry.box.type]} · صندوق <b className="font-display">{entry.box.number}</b> · {boxPersonName(entry.box)}</p></div><b dir="ltr" className="font-display text-gray-900">{formatMoney(entry.amount)} <span className="text-xs font-normal text-gray-500">{currencies[entry.currency]}</span></b></div><p className="break-words text-sm text-gray-600">{entry.method === 'clearing' ? entry.transaction?.notes : entry.transaction?.reference_number}</p><div className="flex flex-wrap gap-3"><SecondaryButton type="button" className="px-3 py-1.5" onClick={() => { setFollowup(null); setBoxId(entry.box.id); }}>فتح الصندوق</SecondaryButton>{entry.statement_url && <Link href={entry.statement_url} prefetch className="self-center text-sm font-semibold text-brand-600">حساب المشترك</Link>}</div></article>)}</div>
        </Modal>}
        {selectedBox && <BoxDetails key={selectedBox.id} box={selectedBox} onClose={closeBox} perform={perform} period={boxPeriod(selectedBox)} />}
    </AuthenticatedLayout>;
}
