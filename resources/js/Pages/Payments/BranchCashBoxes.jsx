import { useEffect, useState } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import SegmentedTabs from '@/Components/SegmentedTabs';
import { formatMoney } from '@/lib/format';
import { boxPersonName, financialBoxesTotals, sortFinancialBoxes } from '@/lib/financialBoxes';
import BoxDetails from './BoxDetails';
import BoxTabs from './BoxTabs';
import StatusGuide from './StatusGuide';
import FinancialBoxList from './FinancialBoxList';
import { boxTypes, BoxTypeIcon } from './CollectorCashBox';
import { FinancialBoxCard, FinancialBoxIdentity, canSendBox, financialAmountsLine } from './FinancialBoxComponents';

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
    closed: 'صناديق أكّد الفرع إغلاقها ولم تُرسل بعد. أرسل صندوقًا وحده، أو حدّد عدة صناديق وأرسلها معًا؛ يصل كل صندوق إلى قسم التدقيق منفردًا برقمه.',
    sent: 'كل صندوق أرسله الفرع إلى التدقيق، ومتى ومن أرسله.',
};

const emptyPlace = {
    open: 'لا صناديق مفتوحة فيها حركات الآن.',
    closed: 'لا صناديق مغلقة تنتظر الإرسال؛ كل ما أُغلق أُرسل.',
    sent: 'لم يُرسل أي صندوق إلى التدقيق بعد.',
};

/** One type of box above the boxes: their total and how many there are; a click narrows the list to it. */
function SummaryTile({ icon, label, boxes, hint, active, onClick }) {
    return <button type="button" onClick={onClick} aria-pressed={active} className={`flex min-w-0 items-center gap-3 rounded-card border bg-surface p-4 text-start shadow-card transition hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 motion-reduce:transform-none ${active ? 'border-gray-900' : 'border-gray-100'}`}>
        {icon}
        <span className="min-w-0"><span className="block text-sm font-semibold text-gray-600">{label}</span><span className="mt-0.5 flex flex-wrap items-baseline gap-1.5"><span dir="ltr" className="font-display text-xl font-bold text-gray-900">{formatMoney(financialBoxesTotals(boxes).ILS)}</span><span className="text-xs text-gray-500">₪</span></span><span className="block text-xs text-gray-500">{boxes.length} {hint}</span></span>
    </button>;
}

/** The boxes the branch is about to send to audit, each on its own, with an optional note for the audit. */
function SendBoxesModal({ boxes, onClose, onSend }) {
    const [note, setNote] = useState('');
    const [sending, setSending] = useState(false);

    return <Modal show onClose={onClose} maxWidth="lg" centered>
        <div role="dialog" aria-modal="true" aria-labelledby="send-boxes-title" className="flex max-h-[calc(100dvh-4rem)] flex-col">
            <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-6 py-4">
                <div><h2 id="send-boxes-title" className="text-xl font-bold text-gray-900">{boxes.length === 1 ? <>إرسال الصندوق <bdi dir="ltr" className="font-display">{boxes[0].number}</bdi> إلى التدقيق</> : `إرسال ${boxes.length} صناديق إلى التدقيق`}</h2><p className="mt-1 text-sm text-gray-500">يصل كل صندوق إلى قسم التدقيق منفردًا برقمه.</p></div>
                <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-control p-2 text-gray-500 hover:bg-gray-100"><Icon name="close" className="h-5 w-5" /></button>
            </header>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-gray-50 p-5">
                <ul className="space-y-2">{boxes.map((box) => <li key={box.id} className="flex items-center justify-between gap-3 rounded-row border border-gray-100 bg-surface p-3"><FinancialBoxIdentity box={box} /><span className="text-end text-sm"><b dir="ltr" className="font-display text-gray-900">{formatMoney(financialBoxesTotals([box]).ILS)}</b> <span className="text-gray-500">شيكل</span><span className="block text-xs text-gray-500">{boxPersonName(box)} · {box.payments?.length ?? 0} حركة</span></span></li>)}</ul>
                <p className="flex items-center justify-between rounded-control bg-surface px-4 py-3 text-sm"><span className="text-gray-600">المجموع</span><b className="font-display text-gray-900">{financialAmountsLine(financialBoxesTotals(boxes))}</b></p>
                <p className="flex gap-2 rounded-control border border-amber-500/25 bg-amber-500/10 p-3 text-sm leading-6 text-amber-800 dark:text-amber-300"><Icon name="lock" className="h-5 w-5 shrink-0" />بعد الإرسال لا يُسحب الصندوق؛ أي تصحيح يكون بالرد على ملاحظة التدقيق إن أعاده.</p>
                <label className="block"><span className="mb-1.5 block text-sm font-semibold text-gray-700">ملاحظة للتدقيق <span className="font-normal text-gray-500">(اختياري)</span></span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={3000} className="block w-full rounded-control border-gray-200 text-sm" placeholder="مثال: الحوالة رقم … وصلت متأخرة إلى البنك" /></label>
            </div>
            <footer className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-6 py-4">
                <SecondaryButton onClick={onClose}>إلغاء</SecondaryButton>
                <PrimaryButton disabled={sending} onClick={() => { setSending(true); onSend(note.trim(), () => setSending(false)); }}><Icon name="send" className="h-4 w-4" />{boxes.length === 1 ? 'إرسال الصندوق' : `إرسال ${boxes.length} صناديق`}</PrimaryButton>
            </footer>
        </div>
    </Modal>;
}

/**
 * The branch's financial boxes, one place per tab so nothing mixes: its
 * open boxes, to review and confirm closed; its closed boxes, to send to
 * audit one by one or several at once; and those it sent. Every box shows
 * when it was opened, closed and sent, and by whom. A last tab lists the entries of
 * the open boxes.
 */
export default function BranchCashBoxes({ branch, branches, started, place, tabs, boxes, access, pendingCount, urls }) {
    const { errors } = usePage().props;
    const [search, setSearch] = useState('');
    const [person, setPerson] = useState('');
    const [type, setType] = useState('');
    const [view, setView] = useState(() => savedPreference('view', 'table', ['table', 'cards']));
    const [sort, setSort] = useState({ key: 'dates', direction: 'desc' });
    const [picked, setPicked] = useState(() => new Set());
    const [sending, setSending] = useState(null);
    const [boxId, setBoxId] = useState(() => Number(new URLSearchParams(window.location.search).get('box')) || null);
    const selectedBox = boxes.find((box) => box.id === boxId);
    const inPlace = boxes.filter((box) => box.place === place);
    const people = [...new Map(inPlace.filter((box) => box.user).map((box) => [box.user.id, box.user.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar'));
    const shown = inPlace.filter((box) => (!type || box.type === type) && (!person || String(box.user?.id) === person) && `${box.number} ${boxPersonName(box)}`.includes(search.trim()));
    const sendable = shown.filter(canSendBox);
    const pickedBoxes = inPlace.filter((box) => picked.has(box.id) && canSendBox(box));
    const selection = place === 'closed' && access.send ? {
        picked,
        toggle: (id) => setPicked((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }),
        toggleAll: (ids) => setPicked((current) => { const all = ids.every((id) => current.has(id)); const next = new Set(current); ids.forEach((id) => (all ? next.delete(id) : next.add(id))); return next; }),
    } : null;

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

    function send(list, note, done) {
        perform('send', null, { box_ids: list.map((box) => box.id), note: note || null }, {
            onSuccess: () => { setSending(null); setPicked(new Set()); closeBox(); },
            onFinish: done,
        });
    }

    function sortBy(key) {
        setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
    }

    const summary = Object.keys(boxTypes).map((key) => ({ key, icon: <BoxTypeIcon type={key} className="h-10 w-10" />, label: boxTypes[key], boxes: inPlace.filter((box) => box.type === key), hint: { open: 'صناديق مفتوحة', closed: 'صناديق لم تُرسل', sent: 'صناديق أُرسلت' }[place], active: type === key, onClick: () => setType(type === key ? '' : key) }));

    return <AuthenticatedLayout badges={{ '/payments/summary': pendingCount }} header={<div><p className="text-sm font-semibold text-gray-500">{branches.length > 1 ? <select aria-label="الفرع" className="rounded-control border-gray-200 py-1 text-sm" value={branch.id} onChange={(event) => router.get(urls.index, { branch_id: event.target.value, place })}>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : branch.name}</p><div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2"><h2 className="text-3xl font-bold text-gray-900">الصناديق المالية</h2><BoxTabs tabs={tabs} current={place} /></div></div>}>
        <Head title="الصناديق المالية" />
        {!started ? <div className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-dashed border-gray-200 bg-surface p-6 text-sm leading-7 text-gray-500">
            <p>لم يُفعّل نظام الصناديق في هذا الفرع بعد. {access.manage ? 'ابدأه لتُجمع دفعات كل محصّل في صناديقه من اليوم.' : 'يُفعّله مسؤول الفرع.'}</p>
            {access.manage && <PrimaryButton onClick={() => perform('start')}><Icon name="wallet" className="h-4 w-4" />بدء نظام الصناديق</PrimaryButton>}
        </div> : <div className="financial-boxes financial-surface space-y-5 pb-24">
            {errors?.action && <p role="alert" className="rounded-control bg-red-500/10 p-4 text-sm text-red-700">{errors.action}</p>}
            <p className="flex items-start gap-2 text-sm leading-6 text-gray-600"><Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />{placeHints[place]}</p>
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
                        : view === 'cards' ? <div className="grid gap-4 py-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{sortFinancialBoxes(shown, sort).map((box) => <FinancialBoxCard key={box.id} box={box} onOpen={(item) => setBoxId(item.id)} onSend={access.send ? setSending : undefined} selection={selection && canSendBox(box) ? selection : null} />)}</div>
                            : <FinancialBoxList boxes={sortFinancialBoxes(shown, sort)} onOpen={(box) => setBoxId(box.id)} onSend={access.send ? setSending : undefined} sortState={{ sort: sort.key, direction: sort.direction }} onSort={sortBy} selection={selection && sendable.length ? { ...selection, toggleAll: () => selection.toggleAll(sendable.map((box) => box.id)) } : null} />}
                </div>
                <p className="data-table-totals text-sm text-gray-600"><span>المعروض <b className="font-display text-gray-900">{shown.length}</b> من <b className="font-display text-gray-900">{inPlace.length}</b> صندوقًا{place === 'sent' && inPlace.length >= 200 ? ' (أحدث 200 صندوق مرسل)' : ''}</span><span>مجموع الصناديق المعروضة: <b className="font-display text-gray-900">{financialAmountsLine(financialBoxesTotals(shown))}</b></span></p>
            </section>
        </div>}
        {pickedBoxes.length > 0 && <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
            <div className="pointer-events-auto flex w-full max-w-3xl flex-wrap items-center gap-3 rounded-[22px] bg-gray-900 p-2.5 ps-4 text-surface shadow-lift">
                <span className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-brand-500 px-2 font-display text-sm font-bold text-white">{pickedBoxes.length}</span>
                <span className="min-w-0 flex-1 leading-5"><b className="block text-sm">{pickedBoxes.length === 1 ? 'صندوق محدد' : 'صناديق محددة'}</b><small className="block font-display text-xs opacity-75">{financialAmountsLine(financialBoxesTotals(pickedBoxes))}</small></span>
                <button type="button" onClick={() => setPicked(new Set())} className="rounded-control px-3 py-2 text-sm font-semibold opacity-80 hover:opacity-100">إلغاء التحديد</button>
                <button type="button" onClick={() => setSending(pickedBoxes)} className="inline-flex items-center gap-1.5 rounded-control bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-glow hover:bg-brand-600"><Icon name="send" className="h-4 w-4" />إرسال إلى التدقيق</button>
            </div>
        </div>}
        {sending && <SendBoxesModal boxes={sending} onClose={() => setSending(null)} onSend={(note, done) => send(sending, note, done)} />}
        {selectedBox && <BoxDetails key={selectedBox.id} box={selectedBox} onClose={closeBox} perform={perform} onSend={access.send ? (box) => setSending([box]) : undefined} />}
    </AuthenticatedLayout>;
}
