import { Fragment, useEffect, useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import SecondaryButton from '@/Components/SecondaryButton';
import SegmentedTabs from '@/Components/SegmentedTabs';
import StatusPill from '@/Components/DataTable/StatusPill';
import { formatMoney } from '@/lib/format';
import { boxPersonName, financialBoxesTotals, filterFinancialBoxes, groupFinancialBoxes, sortFinancialBoxes } from '@/lib/financialBoxes';
import BoxDetails from '../Closings/BoxDetails';
import { periodLabel, periodRange } from '../Closings/ClosingComponents';
import CollectionNavigation from './CollectionNavigation';
import StatusGuide from './StatusGuide';
import { boxTypes, currencies } from './CollectorCashBox';
import { BoxPersonAvatar, FinancialBoxAmount, FinancialBoxButton, FinancialBoxCard, FinancialBoxDates, FinancialBoxEntries, FinancialBoxIdentity, FinancialBoxStatus, FinancialBoxSummary, financialAmountsLine } from './FinancialBoxComponents';

function savedPreference(key, fallback, allowed) {
    try {
        const value = localStorage.getItem(`financial-boxes:${key}`);
        return allowed.includes(value) ? value : fallback;
    } catch {
        return fallback;
    }
}

/** The branch's financial boxes, grouped by employee or shown as cards. */
export default function BranchCashBoxes({ branch, branches, started, boxes, closings, access, pendingCount, collectionUrls, urls }) {
    const { can, errors } = usePage().props;
    const pending = boxes.filter((box) => box.status === 'pending');
    const [status, setStatus] = useState(pending.length ? 'pending' : 'all');
    const [search, setSearch] = useState('');
    const [person, setPerson] = useState('');
    const [view, setView] = useState(() => savedPreference('view', 'table', ['table', 'cards']));
    const [group, setGroup] = useState(() => savedPreference('group', 'person', ['person', 'none']));
    const [sort, setSort] = useState({ key: 'status', direction: 'asc' });
    const [collapsed, setCollapsed] = useState(new Set());
    const [followup, setFollowup] = useState(null);
    const [boxId, setBoxId] = useState(() => Number(new URLSearchParams(window.location.search).get('box')) || null);
    const selectedBox = boxes.find((box) => box.id === boxId);
    const people = [...new Map(boxes.filter((box) => box.user).map((box) => [box.user.id, box.user.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar'));
    const shown = filterFinancialBoxes(boxes, { status, person, search });
    const grouped = group === 'person';
    const active = (entry) => !entry.transaction || entry.transaction.status === 'active';
    const rejected = boxes.flatMap((box) => box.payments.filter((entry) => ['missing', 'rejected'].includes(entry.status) && active(entry)).map((entry) => ({ ...entry, box })));
    const directChecks = boxes.filter((box) => box.kind === 'direct' && box.type === 'bank_transfer').flatMap((box) => box.payments.filter((entry) => entry.status === 'pending' && active(entry)).map((entry) => ({ ...entry, box })));
    const followupEntries = followup === 'rejected' ? rejected : directChecks;
    const currentClosing = closings.find((closing) => new Date(closing.coverage_from) <= new Date() && new Date(closing.coverage_until) >= new Date());
    const statusFilters = [['pending', 'بانتظار الإغلاق'], ['open', 'مفتوحة'], ['received', 'مغلقة'], ['all', 'الكل']].map(([value, label]) => ({ value, label: <>{label} · <span className="font-display">{value === 'all' ? boxes.length : boxes.filter((box) => box.status === value).length}</span></> }));
    const boxPeriod = (box) => periodLabel(closings.find((closing) => closing.id === box.closing_id));

    useEffect(() => {
        try {
            localStorage.setItem('financial-boxes:view', view);
            localStorage.setItem('financial-boxes:group', group);
        } catch {
            return;
        }
    }, [view, group]);

    function closeBox() {
        setBoxId(null);
        const url = new URL(window.location.href);
        url.searchParams.delete('box');
        window.history.replaceState(window.history.state, '', url);
    }

    function perform(kind, record, extra = {}) {
        router.post(`${urls.actions}/${kind}/${record.id}`, { branch_id: branch.id, ...extra }, { preserveScroll: true });
    }

    function toggleGroup(key) {
        setCollapsed((previous) => {
            const next = new Set(previous);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    }

    function sortHeading(key, label) {
        const selected = sort.key === key;
        return <th aria-sort={selected ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" className={`inline-flex items-center gap-1 rounded-md hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 ${selected ? 'text-gray-900' : ''}`} onClick={() => setSort({ key, direction: selected && sort.direction === 'asc' ? 'desc' : 'asc' })}>{label}<span className={`font-display text-[11px] ${selected ? 'text-brand-600' : 'text-gray-400'}`} aria-hidden="true">{selected ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}{'\uFE0E'}</span></button></th>;
    }

    function boxRow(box) {
        return <tr key={box.id} className={`box-row ${box.status === 'pending' ? 'is-pending' : ''}`} onClick={(event) => { if (!event.target.closest('button, a')) { setBoxId(box.id); } }}>
            <td><button type="button" className="block w-full text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900" onClick={() => setBoxId(box.id)} aria-label={`عرض صندوق ${box.number}`}><FinancialBoxIdentity box={box} period={boxPeriod(box)} /></button></td>
            {!grouped && <td data-label="الموظف"><span className="flex items-center gap-2"><BoxPersonAvatar name={box.user?.name} small /><span className="text-gray-700">{boxPersonName(box)}</span></span></td>}
            <td data-label="الحركات"><FinancialBoxEntries box={box} /></td>
            <td data-label="الإجمالي" data-financial-label="الإجمالي"><FinancialBoxAmount box={box} /></td>
            <td data-label="فُتح ← أُغلق" data-financial-label="فُتح ← أُغلق"><FinancialBoxDates box={box} /></td>
            <td data-label="الحالة" data-financial-label="الحالة"><FinancialBoxStatus box={box} compact /></td>
            <td className="text-end"><FinancialBoxButton box={box} onOpen={(item) => setBoxId(item.id)} /></td>
        </tr>;
    }

    const attentionCards = [
        { key: 'rejected', icon: 'alert', label: 'الحركات المرفوضة', count: rejected.length, hint: rejected.length ? `في ${new Set(rejected.map((entry) => entry.box.id)).size} صناديق` : 'لا حركات مرفوضة', tone: 'bg-brand-500/10 text-brand-600' },
        { key: 'checks', icon: 'bank', label: 'حوالات مباشرة للتحقق', count: directChecks.length, hint: directChecks.length ? 'طابِقها مع كشف البنك' : 'لا حوالات تنتظر', tone: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
    ];

    return <AuthenticatedLayout header={<div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-gray-500">{branches.length > 1 ? <select aria-label="الفرع" className="rounded-control border-gray-200 py-1 text-sm" value={branch.id} onChange={(event) => router.get(urls.index, { branch_id: event.target.value })}>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : branch.name}</p><h2 className="mt-1 text-3xl font-bold text-gray-900">الصناديق المالية</h2></div>{currentClosing && <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-surface px-3 py-1.5 text-sm text-gray-600"><Icon name="calendar" className="h-4 w-4" />{periodRange(currentClosing)}</span>}</div>}>
        <Head title="الصناديق المالية" />
        {can.viewOwnCashBoxes && <CollectionNavigation urls={collectionUrls} active="cashBoxes" pendingCount={pendingCount} className="flex-wrap" />}
        {!started ? <p className="rounded-panel border border-dashed border-gray-200 bg-surface p-6 text-sm leading-7 text-gray-500">لم يُفعّل نظام الصناديق في هذا الفرع بعد. {access.manage ? <>ابدأه من <Link href={urls.reconciliation} className="font-semibold text-brand-600">صفحة الخزنة والكشوفات</Link>.</> : 'يُفعّله مسؤول الفرع من صفحة الخزنة والكشوفات.'}</p> : <div className="financial-boxes space-y-6">
            {errors?.action && <p role="alert" className="rounded-control bg-red-500/10 p-4 text-sm text-red-700">{errors.action}</p>}
            <FinancialBoxSummary boxes={boxes} />
            <StatusGuide />
            {access.manage && <section aria-label="بانتظار المتابعة" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{attentionCards.map((item) => <button key={item.key} type="button" onClick={() => setFollowup(item.key)} className="group flex min-w-0 items-center gap-3 rounded-2xl border border-gray-100 bg-surface p-3 pe-4 text-start shadow-card transition hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 motion-reduce:transform-none motion-reduce:transition-none"><span className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.count ? item.tone : 'bg-gray-100 text-gray-400'}`}><Icon name={item.count ? item.icon : 'check'} className="h-5 w-5" />{item.count > 0 && <span className="absolute -end-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 font-display text-[11px] font-bold text-white ring-2 ring-surface">{item.count}</span>}</span><span className="min-w-0 flex-1"><span className={`block text-sm font-semibold ${item.count ? 'text-gray-900' : 'text-gray-500'}`}>{item.label}</span><span className="block truncate text-xs text-gray-500">{item.hint}</span></span><Icon name="chevron-left" className="h-4 w-4 text-gray-300 transition group-hover:text-gray-600" /></button>)}</section>}
            <section aria-label="الصناديق المالية">
                <div className="data-table-toolbar flex flex-wrap items-center justify-between gap-3">
                    <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                        <div className="relative w-full sm:w-72"><Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-gray-400" /><input type="text" aria-label="ابحث باسم الموظف أو رقم الصندوق" placeholder="ابحث باسم الموظف أو رقم الصندوق" value={search} onChange={(event) => setSearch(event.target.value)} className="block w-full py-2.5 pe-4 ps-10 text-sm" /></div>
                        <select aria-label="الموظف" value={person} onChange={(event) => setPerson(event.target.value)} className="w-full py-2.5 text-sm sm:w-56"><option value="">كل الموظفين</option>{people.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}<option value="direct">الدفعات المباشرة</option></select>
                    </div>
                    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                        <SegmentedTabs label="حالة الصندوق" value={status} onChange={setStatus} options={statusFilters} />
                        {view === 'table' && <SegmentedTabs label="تجميع الصناديق" value={group} onChange={setGroup} options={[{ value: 'person', label: <><Icon name="users" className="h-4 w-4" />حسب الموظف</> }, { value: 'none', label: <><Icon name="list" className="h-4 w-4" />قائمة واحدة</> }]} />}
                        <SegmentedTabs label="طريقة العرض" value={view} onChange={setView} options={[{ value: 'table', label: <><Icon name="table" className="h-4 w-4" />جدول</> }, { value: 'cards', label: <><Icon name="grid" className="h-4 w-4" />بطاقات</> }]} />
                    </div>
                </div>
                <div className="data-table-container">
                    {!shown.length ? <div className="flex flex-col items-center gap-2 px-4 py-14 text-center text-gray-500"><Icon name="wallet" className="h-8 w-8 text-gray-400" /><p>لا توجد صناديق بهذه الفلاتر.</p></div> : view === 'cards' ? <div className="grid gap-4 py-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{sortFinancialBoxes(shown, sort).map((box) => <FinancialBoxCard key={box.id} box={box} period={boxPeriod(box)} onOpen={(item) => setBoxId(item.id)} />)}</div> : <table className="data-table w-full text-start text-sm">
                        <thead><tr>{sortHeading('number', 'الصندوق')}{!grouped && <th>الموظف</th>}<th>الحركات</th>{sortHeading('total', 'الإجمالي')}{sortHeading('dates', 'فُتح ← أُغلق')}{sortHeading('status', 'الحالة')}<th data-actions><span className="sr-only">الإجراءات</span></th></tr></thead>
                        <tbody>{grouped ? groupFinancialBoxes(shown).map((employee) => {
                            const waiting = employee.boxes.filter((box) => box.status === 'pending').length;
                            return <Fragment key={employee.key}>
                                <tr className="group-row"><td colSpan={6}><button type="button" onClick={() => toggleGroup(employee.key)} aria-expanded={!collapsed.has(employee.key)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-control px-2 py-1.5 text-start transition hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900"><Icon name="chevron-down" className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${collapsed.has(employee.key) ? 'rotate-90' : ''}`} /><BoxPersonAvatar name={employee.key === 'direct' ? null : employee.name} /><span className="font-bold text-gray-900">{employee.name}{employee.boxes[0]?.isOwn && <span className="text-xs font-semibold text-gray-400"> (أنت)</span>}</span><span className="text-xs text-gray-500"><b className="font-display text-gray-700">{employee.boxes.length}</b> صناديق</span>{waiting > 0 && <StatusPill tone="amber" label={`${waiting} بانتظار الإغلاق`} />}<span className="ms-auto text-sm text-gray-600">المجموع: <b className="font-display text-gray-900">{financialAmountsLine(financialBoxesTotals(employee.boxes))}</b></span></button></td></tr>
                                {!collapsed.has(employee.key) && sortFinancialBoxes(employee.boxes, sort).map(boxRow)}
                            </Fragment>;
                        }) : sortFinancialBoxes(shown, sort).map(boxRow)}</tbody>
                    </table>}
                </div>
                <p className="data-table-totals text-sm text-gray-600"><span>المعروض <b className="font-display text-gray-900">{shown.length}</b> من <b className="font-display text-gray-900">{boxes.length}</b> صندوقًا</span><span>مجموع الصناديق المعروضة: <b className="font-display text-gray-900">{financialAmountsLine(financialBoxesTotals(shown))}</b></span></p>
            </section>
        </div>}
        {followup && <Modal show onClose={() => setFollowup(null)} maxWidth="full" panelClassName="financial-box-followup flex flex-col">
            <header className="flex items-center justify-between gap-3 border-b border-gray-100 p-6"><div><h2 className="text-xl font-bold text-gray-900">{followup === 'rejected' ? 'الحركات المرفوضة' : 'حوالات مباشرة للتحقق'}</h2><p className="mt-1 text-sm text-gray-500">راجع الحركات وصحّحها من حساب المشترك عند الحاجة.</p></div><button type="button" onClick={() => setFollowup(null)} aria-label="إغلاق المتابعة" className="rounded-control p-2 text-gray-500 hover:bg-gray-100"><Icon name="close" className="h-5 w-5" /></button></header>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gray-50 p-5">{!followupEntries.length ? <p className="py-10 text-center text-sm text-gray-500">لا توجد حركات تنتظر المتابعة.</p> : followupEntries.map((entry) => <article key={entry.id} className="space-y-3 rounded-2xl border border-gray-100 bg-surface p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-gray-900">{entry.transaction?.subscription?.subscription_name || entry.transaction?.subscription?.full_name || '—'}</p><p className="text-xs text-gray-500">{boxTypes[entry.box.type]} · صندوق <b className="font-display">{entry.box.number}</b> · {boxPersonName(entry.box)}</p></div><b dir="ltr" className="font-display text-gray-900">{formatMoney(entry.amount)} <span className="text-xs font-normal text-gray-500">{currencies[entry.currency]}</span></b></div><p className="break-words text-sm text-gray-600">{entry.method === 'clearing' ? entry.transaction?.notes : entry.transaction?.reference_number}</p><div className="flex flex-wrap gap-3"><SecondaryButton type="button" className="px-3 py-1.5" onClick={() => { setFollowup(null); setBoxId(entry.box.id); }}>فتح الصندوق</SecondaryButton>{entry.statement_url && <Link href={entry.statement_url} prefetch className="self-center text-sm font-semibold text-brand-600">حساب المشترك</Link>}</div></article>)}</div>
        </Modal>}
        {selectedBox && <BoxDetails key={selectedBox.id} box={selectedBox} access={access} onClose={closeBox} perform={perform} period={boxPeriod(selectedBox)} />}
    </AuthenticatedLayout>;
}
