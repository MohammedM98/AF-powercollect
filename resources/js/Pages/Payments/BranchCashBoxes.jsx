import { useEffect, useState } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from '@/Components/Icon';
import SearchableSelect from '@/Components/SearchableSelect';
import SegmentedTabs from '@/Components/SegmentedTabs';
import { formatMoney } from '@/lib/format';
import { boxPersonName, financialBoxesTotals, sortFinancialBoxes } from '@/lib/financialBoxes';
import BoxDetails from './BoxDetails';
import BoxTabs from './BoxTabs';
import StatusGuide from './StatusGuide';
import FinancialBoxList from './FinancialBoxList';
import { boxTypes, BoxTypeIcon } from './CollectorCashBox';
import { FinancialBoxCard, financialAmountsLine } from './FinancialBoxComponents';

const periodDate = (date) => new Intl.DateTimeFormat('ar-u-nu-latn', { dateStyle: 'medium', timeZone: 'Asia/Gaza' }).format(new Date(`${date}T12:00:00Z`));

function savedPreference(key, fallback, allowed) {
    try {
        const value = localStorage.getItem(`financial-boxes:${key}`);
        return allowed.includes(value) ? value : fallback;
    } catch {
        return fallback;
    }
}

/** What each place holds, said under the tabs. */
const placeHints = {
    open: 'صناديق المحصّلين التي ما زالت تستقبل حركات. راجع الصندوق وأكّد إغلاقه فينتقل إلى «المغلقة».',
    closed: 'كل الصناديق المغلقة متاحة للتدقيق تلقائيًا. اختر الفترة الأسبوعية لعرض الصناديق حسب تاريخ إغلاقها.',
};

const emptyPlace = {
    open: 'لا صناديق مفتوحة فيها حركات الآن.',
    closed: 'لا توجد صناديق مغلقة خلال هذه الفترة.',
};

/** One type of box above the boxes: their total and how many there are; a click narrows the list to it. */
function SummaryTile({ icon, label, boxes, hint, active, onClick }) {
    return <button type="button" onClick={onClick} aria-pressed={active} className={`flex min-w-0 items-center gap-3 rounded-card border bg-surface p-4 text-start shadow-card transition hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 motion-reduce:transform-none ${active ? 'border-gray-900' : 'border-gray-100'}`}>
        {icon}
        <span className="min-w-0"><span className="block text-sm font-semibold text-gray-600">{label}</span><span className="mt-0.5 flex flex-wrap items-baseline gap-1.5"><span dir="ltr" className="font-display text-xl font-bold text-gray-900">{formatMoney(financialBoxesTotals(boxes).ILS)}</span><span className="text-xs text-gray-500">₪</span></span><span className="block text-xs text-gray-500">{boxes.length} {hint}</span></span>
    </button>;
}

/** Open boxes for closing, and closed boxes grouped by their closing week. */
export default function BranchCashBoxes({ branch, branches, started, place, tabs, boxes, periods, week, pendingCount, urls }) {
    const { errors } = usePage().props;
    const [search, setSearch] = useState('');
    const [person, setPerson] = useState('');
    const [type, setType] = useState('');
    const [view, setView] = useState(() => savedPreference('view', 'table', ['table', 'cards']));
    const [sort, setSort] = useState({ key: 'dates', direction: 'desc' });
    const [boxId, setBoxId] = useState(() => Number(new URLSearchParams(window.location.search).get('box')) || null);
    const selectedBox = boxes.find((box) => box.id === boxId);
    const inPlace = boxes.filter((box) => box.place === place);
    const people = [...new Map(inPlace.filter((box) => box.user).map((box) => [box.user.id, box.user.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar'));
    const shown = inPlace.filter((box) => (!type || box.type === type) && (!person || String(box.user?.id) === person) && `${box.number} ${boxPersonName(box)}`.includes(search.trim()));
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

    function perform(kind, record, extra = {}, options = {}) {
        router.post(`${urls.actions}/${kind}${record ? `/${record.id}` : ''}`, { branch_id: branch.id, ...extra }, { preserveScroll: true, ...options });
    }

    function sortBy(key) {
        setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
    }

    const summary = Object.keys(boxTypes).map((key) => ({ key, icon: <BoxTypeIcon type={key} className="h-10 w-10" />, label: boxTypes[key], boxes: inPlace.filter((box) => box.type === key), hint: { open: 'صناديق مفتوحة', closed: 'صناديق مغلقة في الفترة' }[place], active: type === key, onClick: () => setType(type === key ? '' : key) }));

    return <AuthenticatedLayout badges={{ '/payments/summary': pendingCount }} header={<div><p className="text-sm font-semibold text-gray-500">{branches.length > 1 ? <select aria-label="الفرع" className="rounded-control border-gray-200 py-1 text-sm" value={branch.id} onChange={(event) => router.get(urls.index, { branch_id: event.target.value, place, ...(place === 'closed' ? { week } : {}) })}>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : branch.name}</p><div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2"><h2 className="text-3xl font-bold text-gray-900">الصناديق المالية</h2><BoxTabs tabs={tabs} current={place} /></div></div>}>
        <Head title="الصناديق المالية" />
        {!started ? <div className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-dashed border-gray-200 bg-surface p-6 text-sm leading-7 text-gray-500">
            <p>تُفتح الصناديق تلقائيًا عند تسجيل أول دفعة أو مقاصة في الفرع، وتُضاف كل حركة إلى صندوق الموظف حسب نوعها.</p>
        </div> : <div className="financial-boxes financial-surface space-y-5">
            {errors?.action && <p role="alert" className="rounded-control bg-red-500/10 p-4 text-sm text-red-700">{errors.action}</p>}
            <p className="flex items-start gap-2 text-sm leading-6 text-gray-600"><Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />{placeHints[place]}</p>
            {place === 'closed' && <div className="flex flex-wrap items-end justify-between gap-4 rounded-card border border-gray-100 bg-surface p-4 shadow-card sm:p-5">
                <div className="flex min-w-0 flex-1 items-start gap-3"><Icon name="calendar" className="mt-1 h-5 w-5 shrink-0 text-gray-500" /><div><h3 className="font-bold text-gray-900">فترة الصناديق المغلقة</h3><p className="text-xs text-gray-500">المجاميع والصناديق المعروضة تخص الفترة المختارة.</p></div></div>
                <div className="w-full sm:w-96"><label htmlFor="closed-box-week" className="mb-1 block text-sm font-medium text-gray-700">الفترة الأسبوعية</label><SearchableSelect id="closed-box-week" value={week} clearable={false} options={periods.map((period) => ({ value: period.start, label: `${periodDate(period.start)} — ${periodDate(period.end)}`, hint: `${period.count} صندوق` }))} onChange={(value) => router.get(urls.index, { branch_id: branch.id, place: 'closed', week: value }, { preserveScroll: true })} /></div>
            </div>}
            <section aria-label="ملخص" className="grid gap-3 sm:grid-cols-3">{summary.map(({ key, ...tile }) => <SummaryTile key={key} {...tile} />)}</section>
            <StatusGuide />
            <section aria-label="الصناديق">
                <div className="data-table-toolbar flex flex-wrap items-center justify-between gap-3">
                    <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                        <div className="relative w-full sm:w-72"><Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-gray-400" /><input type="text" aria-label="ابحث باسم الموظف أو رقم الصندوق" placeholder="ابحث باسم الموظف أو رقم الصندوق" value={search} onChange={(event) => setSearch(event.target.value)} className="block w-full py-2.5 pe-4 ps-10 text-sm" /></div>
                        <select aria-label="الموظف" value={person} onChange={(event) => setPerson(event.target.value)} className="w-full py-2.5 text-sm sm:w-56"><option value="">كل الموظفين</option>{people.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}</select>
                    </div>
                    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                        <SegmentedTabs label="نوع الصندوق" value={type} onChange={setType} options={[{ value: '', label: 'كل الأنواع' }, ...Object.entries(boxTypes).map(([value, label]) => ({ value, label }))]} />
                        <SegmentedTabs label="طريقة العرض" value={view} onChange={setView} options={[{ value: 'table', label: <><Icon name="table" className="h-4 w-4" />جدول</> }, { value: 'cards', label: <><Icon name="grid" className="h-4 w-4" />بطاقات</> }]} />
                    </div>
                </div>
                <div className="data-table-container financial-box-list-container">
                    {!shown.length ? <div className="flex flex-col items-center gap-2 px-4 py-14 text-center text-gray-500"><Icon name="wallet" className="h-8 w-8 text-gray-400" /><p>{inPlace.length ? 'لا توجد صناديق بهذه الفلاتر.' : emptyPlace[place]}</p></div>
                        : view === 'cards' ? <div className="grid gap-4 py-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{sortFinancialBoxes(shown, sort).map((box) => <FinancialBoxCard key={box.id} box={box} onOpen={(item) => setBoxId(item.id)} />)}</div>
                            : <FinancialBoxList boxes={sortFinancialBoxes(shown, sort)} onOpen={(box) => setBoxId(box.id)} sortState={{ sort: sort.key, direction: sort.direction }} onSort={sortBy} />}
                </div>
                <p className="data-table-totals text-sm text-gray-600"><span>المعروض <b className="font-display text-gray-900">{shown.length}</b> من <b className="font-display text-gray-900">{inPlace.length}</b> صندوقًا</span><span>مجموع الصناديق المعروضة: <b className="font-display text-gray-900">{financialAmountsLine(financialBoxesTotals(shown))}</b></span></p>
            </section>
        </div>}
        {selectedBox && <BoxDetails key={selectedBox.id} box={selectedBox} onClose={closeBox} perform={perform} />}
    </AuthenticatedLayout>;
}
