import { useEffect, useMemo, useState } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ConfirmDialog from '@/Components/ConfirmDialog';
import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import SegmentedTabs from '@/Components/SegmentedTabs';
import { WEEKLY_STATUSES, weeklyStepStates } from '@/lib/weeklyClosings';
import { BankMark } from '../Subscriptions/PaymentModal';
import { boxTypeStyles, BoxTypeIcon } from '../Payments/CollectorCashBox';
import { BoxPersonAvatar } from '../Payments/FinancialBoxComponents';
import { branchClock, branchDate, dateTime, periodLabel, periodRange } from '../Closings/ClosingComponents';
import WeeklyBoxModal from './WeeklyBoxModal';
import { activeEntries, addAmounts, amountOf, BankStack, BigShekels, boxesWord, byReceivingBank, collectorsWord, entriesWord, foreignLine, ReviewMeter, ReviewPill, Shekels, typeBars } from './WeeklyParts';

const TYPES = Object.keys(boxTypeStyles);
const REVIEW_FILTERS = [{ value: 'all', label: 'الكل' }, { value: 'pending', label: 'لم تُراجع' }, { value: 'done', label: 'تمت مراجعتها' }];
const VIEWS = [
    { value: 'collectors', label: <span className="inline-flex items-center gap-1.5"><Icon name="users" className="h-4 w-4" />حسب المحصّل</span> },
    { value: 'boxes', label: <span className="inline-flex items-center gap-1.5"><Icon name="list" className="h-4 w-4" />كل الصناديق</span> },
];
const BOX_GRID = 'md:grid-cols-[2.5rem_minmax(0,1.5fr)_minmax(0,1fr)_4.5rem_minmax(0,1.1fr)_7.5rem_1rem]';
const BOX_GRID_ALL = 'md:grid-cols-[2.5rem_minmax(0,1.2fr)_minmax(0,1.4fr)_4rem_minmax(0,1.1fr)_7.5rem_1rem]';
const SORT_VALUES = {
    number: (box) => box.number,
    person: (box) => box.userName ?? '',
    entries: (box) => box.entries,
    total: (box) => amountOf(box.amounts),
};
const personKey = (box) => String(box.userId ?? 'none');

function sortBoxes(boxes, { key, direction }) {
    const value = SORT_VALUES[key];

    return [...boxes].sort((a, b) => {
        const [first, second] = [value(a), value(b)];
        const order = typeof first === 'number' ? first - second : String(first).localeCompare(String(second), 'ar');

        return direction === 'asc' ? order : -order;
    });
}

/** The boxes the branch marked reviewed this week, kept in this browser: the mark only helps the branch keep track. */
function useReviewedBoxes(weekId) {
    const key = `weekly-closings:reviewed:${weekId}`;
    const [reviewed, setReviewed] = useState(() => {
        try {
            return new Set(JSON.parse(localStorage.getItem(key) ?? '[]'));
        } catch {
            return new Set();
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify([...reviewed]));
        } catch {
            return;
        }
    }, [key, reviewed]);

    return [reviewed, setReviewed];
}

function Notice({ tone = 'amber', items }) {
    if (!items?.length) return null;
    const colors = tone === 'red' ? 'border-brand-500/25 bg-brand-500/5 text-brand-600' : 'border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-400';

    return <ul className={`space-y-1 rounded-control border p-3.5 text-sm ${colors}`}>{items.map((item) => <li key={item} className="flex items-start gap-2"><Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />{item}</li>)}</ul>;
}

/** The week at the top of the page: which week, where it stands, and its steps on the way to audit. */
function WeekBand({ week, branch }) {
    const [label] = WEEKLY_STATUSES[week.step];
    const tone = { review: 'bg-sky-400/15 text-sky-200', confirm: 'bg-amber-400/15 text-amber-300', audit: 'bg-white/10 text-[#e4e8ed]', answered: 'bg-emerald-400/15 text-emerald-300' }[week.step];
    const totals = week.weekTotals;
    const steps = weeklyStepStates(week.step);

    return <section aria-labelledby="week-title" className="relative overflow-hidden rounded-panel bg-graphite-gradient text-white shadow-lift">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-spectrum" />
        <div className="grid gap-6 p-5 sm:p-7 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{label}</span>
                    {week.is_manual && <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-[#e4e8ed]">إغلاق مبكر</span>}
                </div>
                <h3 id="week-title" className="font-luxe text-3xl font-bold leading-tight">{periodLabel(week)}</h3>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[#cdd3da]">
                    <span className="inline-flex items-center gap-1.5"><Icon name="pin" className="h-4 w-4" />{branch.name}</span>
                    <span className="inline-flex items-center gap-1.5"><Icon name="calendar" className="h-4 w-4" />{periodRange(week)} <span className="font-display">{week.year}</span></span>
                    <span className="inline-flex items-center gap-1.5"><Icon name="wallet" className="h-4 w-4" /><span>{boxesWord(totals.boxes)} · {collectorsWord(totals.collectors)} · {entriesWord(totals.entries)}</span></span>
                </p>
            </div>
            <ol aria-label="مراحل الإغلاق الأسبوعي" className="grid grid-cols-4 gap-2 sm:gap-3 xl:w-[520px]">{steps.map((step, index) => <li key={step.key} aria-current={step.state === 'current' ? 'step' : undefined} title={step.hint} className="relative flex flex-col items-center gap-1.5 text-center">
                {index < steps.length - 1 && <span aria-hidden="true" className={`absolute top-4 h-px ${step.state === 'done' ? 'bg-emerald-500/70' : 'bg-white/20'}`} style={{ insetInlineStart: 'calc(50% + 1.25rem)', width: 'calc(100% - 2rem)' }} />}
                {step.state === 'done' ? <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white"><Icon name="check" className="h-4 w-4" /></span>
                    : step.state === 'current' ? <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white font-display text-sm font-bold text-[#111820] ring-4 ring-white/15">{index + 1}</span>
                        : <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 font-display text-sm text-[#cdd3da]">{index + 1}</span>}
                <span className={`text-xs font-semibold leading-5 ${step.state === 'upcoming' ? 'text-[#9aa3ae]' : 'text-white'}`}>{step.label}</span>
            </li>)}</ol>
        </div>
    </section>;
}

/** The week's boxes by type, each card also the filter for its type. */
function TypeCards({ boxes, type, onType }) {
    const grand = addAmounts(boxes.map((box) => box.amounts)).ILS;
    const banks = [...new Set(boxes.filter((box) => box.type === 'bank_transfer').flatMap((box) => activeEntries(box).map((entry) => entry.bankName).filter(Boolean)))];

    return <section aria-label="الصناديق حسب نوع التحصيل" className="grid gap-3 sm:grid-cols-3">{TYPES.map((key) => {
        const owned = boxes.filter((box) => box.type === key);
        const totals = addAmounts(owned.map((box) => box.amounts));
        const share = grand ? Math.round((totals.ILS / grand) * 100) : 0;
        const active = type === key;

        return <button key={key} type="button" aria-pressed={active} onClick={() => onType(active ? 'all' : key)} className={`group flex min-w-0 flex-col gap-3 rounded-card border bg-surface p-4 text-start shadow-card transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 ${active ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-100 hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-lift motion-reduce:transform-none'}`}>
            <span className="flex w-full items-start gap-3">
                <BoxTypeIcon type={key} className="h-11 w-11" />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-gray-600">{boxTypeStyles[key].label}</span>
                        {active && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-surface"><Icon name="check" className="h-3.5 w-3.5" /></span>}
                    </span>
                    <b className="block truncate text-xl text-gray-900"><BigShekels value={totals.ILS} /></b>
                    <span className="flex items-center justify-between gap-2 text-xs text-gray-500"><span className="truncate">{boxesWord(owned.length)} · {entriesWord(owned.reduce((count, box) => count + box.entries, 0))}</span>{key === 'bank_transfer' && banks.length > 0 && <BankStack banks={banks} max={3} />}</span>
                </span>
            </span>
            <span className="flex w-full items-center gap-2" title="حصة النوع من إجمالي الأسبوع">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-gray-100"><span className={`block h-full rounded-full ${typeBars[key]}`} style={{ width: `${share}%` }} /></span>
                <span className="font-display text-xs text-gray-500">{share}%</span>
            </span>
        </button>;
    })}</section>;
}

/** The labels over a list of boxes; in the list of every box they sort it. */
function BoxHeader({ withPerson, sort, onSort }) {
    const columns = [['number', 'الصندوق', 'col-span-2'], withPerson ? ['person', 'المحصّل · الإغلاق'] : ['closed', 'أُغلق'], ['entries', 'الحركات'], ['total', 'الإجمالي'], [null, 'المراجعة'], [null, '']];

    return <div className={`hidden gap-x-4 px-[13px] pb-1 text-xs font-semibold text-gray-400 md:grid ${withPerson ? BOX_GRID_ALL : BOX_GRID}`}>{columns.map(([key, label, span = '']) => onSort && key
        ? <button key={key} type="button" onClick={() => onSort(key)} aria-sort={sort.key === key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={`inline-flex items-center gap-1 justify-self-start rounded-md transition hover:text-gray-800 ${sort.key === key ? 'text-gray-800' : ''} ${span}`}>
            {label}
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10l4-4 4 4" className={sort.key === key && sort.direction === 'asc' ? 'text-brand-500' : 'opacity-40'} /><path strokeLinecap="round" strokeLinejoin="round" d="M8 14l4 4 4-4" className={sort.key === key && sort.direction === 'desc' ? 'text-brand-500' : 'opacity-40'} /></svg>
        </button>
        : <span key={label || 'open'} className={span}>{label}</span>)}</div>;
}

function BoxRow({ box, reviewed, withPerson, onOpen }) {
    const banks = box.type === 'bank_transfer' ? byReceivingBank(activeEntries(box)).map((group) => group.bank) : [];

    return <li><button type="button" onClick={() => onOpen(box.id)} className={`group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-row border border-gray-100 bg-surface px-3 py-3 text-start transition hover:border-gray-300 hover:shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 md:gap-x-4 ${withPerson ? BOX_GRID_ALL : BOX_GRID}`}>
        <BoxTypeIcon type={box.type} className="row-span-2 h-10 w-10 md:row-span-1" />
        <span className="min-w-0">
            <b className="block truncate text-sm text-gray-900">صندوق <bdi dir="ltr" className="font-display">{box.number}</bdi></b>
            <small className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">{boxTypeStyles[box.type].label}{banks.length > 0 && <BankStack banks={banks} />}{box.carried === 'out' && <span className="text-amber-700 dark:text-amber-400">يُرحّل للأسبوع القادم</span>}{box.carried === 'in' && <span>من أسبوع سابق</span>}</small>
        </span>
        {withPerson ? <span className="hidden min-w-0 items-center gap-2 md:flex"><BoxPersonAvatar name={box.userName} small /><span className="min-w-0"><span className="block truncate text-sm text-gray-700">{box.userName ?? '—'}</span><span className="block truncate text-xs text-gray-500">{box.closedAt ? `${branchDate(box.closedAt)} · ${branchClock(box.closedAt)}` : 'لم يُغلق بعد'}</span></span></span>
        : <span className="hidden text-xs leading-5 text-gray-500 md:block">{box.closedAt ? <><span className="text-gray-700">{branchDate(box.closedAt)}</span><br /><span className="font-display">{branchClock(box.closedAt)}</span></> : <span className="text-amber-700 dark:text-amber-400">لم يُغلق بعد</span>}</span>}
        <span className="hidden font-display text-sm font-semibold text-gray-700 md:block">{box.entries}</span>
        <span className="text-end md:text-start"><b className="block text-sm text-gray-900"><Shekels value={box.amounts?.ILS} /></b>{foreignLine(box.amounts) && <small className="block text-xs text-gray-500">{foreignLine(box.amounts)}</small>}</span>
        <span className="col-start-2 col-end-4 flex items-center justify-between gap-2 md:col-auto md:block"><span className="text-xs text-gray-500 md:hidden">{withPerson && <>{box.userName ?? '—'} · </>}{entriesWord(box.entries)}</span><ReviewPill reviewed={reviewed} /></span>
        <Icon name="chevron-left" className="hidden h-4 w-4 text-gray-300 transition group-hover:-translate-x-0.5 group-hover:text-gray-600 md:block" />
    </button></li>;
}

/** A collector's row: what they hold by type, how much of it was reviewed, and their boxes when opened. */
function CollectorGroup({ person, boxes, allBoxes, open, onToggle, reviewed, canReview, onMark, onOpen }) {
    const totals = addAmounts(boxes.map((box) => box.amounts));
    const done = allBoxes.filter((box) => reviewed.has(box.id)).length;

    return <article>
        <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={`collector-${person.key}`} className={`flex w-full items-center gap-3 rounded-row px-3 py-4 text-start transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 sm:gap-5 ${open ? 'bg-gray-50' : ''}`}>
            <span className="relative shrink-0"><span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-gray-900 text-sm font-bold text-surface">{person.name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('')}</span>{done === allBoxes.length && <span className="absolute -bottom-1 -end-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-surface"><Icon name="check" className="h-3 w-3" /></span>}</span>
            <span className="min-w-0 flex-1"><b className="block truncate text-base text-gray-900">{person.name}</b><span className="block truncate text-xs text-gray-500">{boxesWord(boxes.length)} · {entriesWord(boxes.reduce((count, box) => count + box.entries, 0))}</span></span>
            <span className="hidden items-start gap-6 2xl:flex">{TYPES.map((key) => {
                const ofType = boxes.filter((box) => box.type === key);

                return <span key={key} className="flex min-w-[96px] flex-col"><small className="flex items-center gap-1.5 text-xs text-gray-400"><span className={`h-1.5 w-1.5 rounded-full ${typeBars[key]}`} />{boxTypeStyles[key].label}</small><b className={`text-sm font-semibold ${ofType.length ? 'text-gray-800' : 'text-gray-300'}`}>{ofType.length ? <Shekels value={addAmounts(ofType.map((box) => box.amounts)).ILS} /> : '—'}</b></span>;
            })}</span>
            <span className="hidden min-w-[96px] flex-col items-start gap-1 sm:flex"><small className="text-xs text-gray-400">المراجعة</small><ReviewMeter done={done} total={allBoxes.length} /></span>
            <span className="flex flex-col items-end text-end sm:min-w-[140px]"><small className="text-xs text-gray-400">الإجمالي</small><b className="text-lg text-gray-900"><BigShekels value={totals.ILS} /></b>{foreignLine(totals) && <small className="text-xs text-gray-500">{foreignLine(totals)}</small>}</span>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition ${open ? 'rotate-180 bg-gray-100 text-gray-700' : ''}`}><Icon name="chevron-down" className="h-4 w-4" /></span>
        </button>
        {open && <div id={`collector-${person.key}`} className="mb-2 space-y-2 rounded-card bg-gray-50 px-2 pb-4 pt-2 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-2 px-2">
                <span className="flex items-center gap-2 sm:hidden"><small className="text-xs text-gray-400">المراجعة</small><ReviewMeter done={done} total={allBoxes.length} /></span>
                {canReview && (done === allBoxes.length
                    ? <button type="button" onClick={() => onMark(allBoxes, false)} className="ms-auto inline-flex items-center gap-1.5 rounded-control px-2.5 py-1 text-xs font-semibold text-gray-500 transition hover:bg-gray-100"><Icon name="undo" className="h-3.5 w-3.5" />إلغاء مراجعة صناديق {person.name}</button>
                    : <button type="button" onClick={() => onMark(allBoxes, true)} className="ms-auto inline-flex items-center gap-1.5 rounded-control border border-gray-200 bg-surface px-3 py-1.5 text-xs font-semibold text-gray-800 transition hover:bg-gray-100"><Icon name="check" className="h-3.5 w-3.5" />تمت مراجعة كل صناديق {person.name} (<span className="font-display">{allBoxes.length - done}</span>)</button>)}
            </div>
            <BoxHeader />
            <ul className="space-y-1.5">{boxes.map((box) => <BoxRow key={box.id} box={box} reviewed={reviewed.has(box.id)} onOpen={onOpen} />)}</ul>
        </div>}
    </article>;
}

/** The approval panel: the week's total, by type and by bank, the branch's review, and confirming the week. */
function ApprovalPanel({ week, reviewed, canReview, notes, onNotes, onMarkAll, onSubmit, onWithdraw }) {
    const totals = week.weekTotals;
    const reviewedCount = week.boxes.filter((box) => reviewed.has(box.id)).length;
    const transferGroups = byReceivingBank(week.boxes.filter((box) => box.type === 'bank_transfer').flatMap(activeEntries));
    const openBoxes = totals.boxes - totals.closedBoxes;
    const checks = [
        [openBoxes === 0, openBoxes === 0 ? 'جميع الصناديق مغلقة' : <>{boxesWord(openBoxes)} لم تُغلق بعد</>],
        [week.boxes.every((box) => box.userId), 'كل صندوق مرتبط بمحصّله'],
        [true, <>الحركات مرفقة بالتفصيل · {entriesWord(totals.entries)}</>],
    ];

    let action;
    if (week.can.submit) {
        action = <>
            <label htmlFor="weekly-notes" className="block text-sm font-semibold text-gray-700">ملاحظة لقسم التدقيق <span className="font-normal text-gray-400">(اختياري)</span></label>
            <textarea id="weekly-notes" rows="3" value={notes} onChange={(event) => onNotes(event.target.value)} className="block w-full text-sm" />
            <PrimaryButton type="button" disabled={week.blockers.length > 0} onClick={onSubmit} className="w-full py-3"><Icon name="send" className="h-4 w-4" />اعتماد وإرسال حزمة الأسبوع</PrimaryButton>
        </>;
    } else if (week.frozen) {
        action = <div className="space-y-3 rounded-control border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-300">
            <p className="flex items-center gap-2 font-bold"><Icon name="check" className="h-4 w-4" />{WEEKLY_STATUSES[week.step][0]}</p>
            {week.branchApprovedAt && <p className="text-xs leading-6">اعتمدها {week.branchApprovedBy ?? '—'} · {dateTime(week.branchApprovedAt)}<br />الأرقام كما ثُبّتت لحظة الإرسال.</p>}
            {week.branchNotes && <p className="border-t border-emerald-500/20 pt-2 text-xs leading-6">ملاحظة الفرع: {week.branchNotes}</p>}
            {week.can.withdraw && <SecondaryButton type="button" onClick={onWithdraw} className="w-full"><Icon name="undo" className="h-4 w-4" />سحب من التدقيق</SecondaryButton>}
        </div>;
    } else if (week.step === 'review') {
        action = <p className="flex gap-2 rounded-control bg-sky-500/10 p-4 text-sm leading-6 text-sky-700 dark:text-sky-400"><Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0" />الأسبوع ما زال جاريًا. يُعتمد ويُرسل بعد انتهائه في {dateTime(week.coverage_until)}.</p>;
    } else {
        action = <p className="flex gap-2 rounded-control bg-gray-100 p-4 text-sm leading-6 text-gray-600"><Icon name="eye" className="mt-0.5 h-4 w-4 shrink-0" />لديك صلاحية العرض فقط. يعتمد الحزمة مسؤول الفرع.</p>;
    }

    return <aside aria-labelledby="approve-title" className="overflow-hidden rounded-panel border border-gray-100 bg-surface shadow-card lg:sticky lg:top-24">
        <header className="flex items-start justify-between gap-3 px-5 pb-4 pt-5">
            <div><h3 id="approve-title" className="text-lg font-bold text-gray-900">اعتماد حزمة الأسبوع</h3><p className="text-xs text-gray-500">تُرسل إلى قسم التدقيق المالي</p></div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-brand-500/10 text-brand-600"><Icon name="shield" className="h-5 w-5" /></span>
        </header>
        <div className="space-y-5 px-5 pb-5">
            <div className="rounded-card bg-gray-50 p-4">
                <p className="text-xs font-semibold text-gray-500">الإجمالي كما أُغلق في الفرع</p>
                <p className="mt-1 text-3xl font-bold text-gray-900"><BigShekels value={totals.amounts.ILS} /></p>
                {foreignLine(totals.amounts) && <p className="text-xs text-gray-500">{foreignLine(totals.amounts)}</p>}
                <span aria-hidden="true" className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-gray-200">{totals.byType.map((row) => <span key={row.type} className={typeBars[row.type]} style={{ width: `${amountOf(totals.amounts) ? (amountOf(row.amounts) / amountOf(totals.amounts)) * 100 : 0}%` }} />)}</span>
                <ul className="mt-3 space-y-1.5">{totals.byType.map((row) => <li key={row.type} className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2 text-gray-600"><span className={`h-2 w-2 rounded-full ${typeBars[row.type]}`} />{boxTypeStyles[row.type].label}<span className="font-display text-xs text-gray-400">({row.boxes})</span></span><b className="text-gray-900"><Shekels value={row.amounts.ILS} /></b></li>)}</ul>
            </div>

            {transferGroups.length > 0 && <details className="group rounded-card border border-gray-100 px-4 py-3" open>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-gray-700">الحوالات حسب البنك المستلم<Icon name="chevron-down" className="h-4 w-4 text-gray-400 transition group-open:rotate-180" /></summary>
                <ul className="mt-3 space-y-2.5">{transferGroups.map((group) => <li key={group.bank} className="flex items-center gap-2.5 text-sm">
                    <BankMark bank={group.bank} className="h-7 w-7 rounded-lg" />
                    <span className="min-w-0 flex-1"><span className="block leading-5 text-gray-700">{group.bank}</span><span className="block text-xs text-gray-400">{entriesWord(group.entries.length)}</span></span>
                    <span className="text-end"><b className="text-gray-900"><Shekels value={group.totals.ILS} /></b>{foreignLine(group.totals) && <small className="block text-xs text-gray-500">{foreignLine(group.totals)}</small>}</span>
                </li>)}</ul>
            </details>}

            {week.boxes.length > 0 && <div>
                <div className="mb-1.5 flex items-center justify-between text-sm"><span className="font-semibold text-gray-700">متابعة المراجعة</span><span className="font-display text-xs text-gray-500">{reviewedCount} / {week.boxes.length}</span></div>
                <div role="progressbar" aria-label="الصناديق التي تمت مراجعتها" aria-valuemin="0" aria-valuemax={week.boxes.length} aria-valuenow={reviewedCount} className="h-1.5 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full transition-all ${reviewedCount === week.boxes.length ? 'bg-emerald-500' : 'bg-gray-900'}`} style={{ width: `${Math.round((reviewedCount / week.boxes.length) * 100)}%` }} /></div>
                <p className="mt-1.5 text-xs leading-5 text-gray-400">علامة المراجعة لمتابعتك فقط. الاعتماد يشمل الحزمة كاملة.</p>
                {canReview && (reviewedCount === week.boxes.length
                    ? <button type="button" onClick={() => onMarkAll(false)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-control px-3 py-2 text-sm font-semibold text-gray-500 transition hover:bg-gray-100"><Icon name="undo" className="h-4 w-4" />إلغاء كل علامات المراجعة</button>
                    : <button type="button" onClick={() => onMarkAll(true)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-control border border-gray-200 bg-surface px-3 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-100"><Icon name="check" className="h-4 w-4" />تمت مراجعة كل الصناديق<span className="rounded-full bg-gray-100 px-2 font-display text-xs text-gray-600">{week.boxes.length - reviewedCount}</span></button>)}
            </div>}

            <ul className="space-y-2 border-y border-gray-100 py-4">{checks.map(([ok, label], index) => <li key={index} className="flex items-center gap-2 text-sm text-gray-700">
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'}`}><Icon name={ok ? 'check' : 'alert'} className="h-3.5 w-3.5" /></span>{label}
            </li>)}</ul>

            <Notice items={week.blockers} tone="red" />
            <Notice items={week.warnings} />

            <p className="flex gap-2 text-xs leading-6 text-gray-500"><Icon name="lock" className="mt-1 h-4 w-4 shrink-0" />تُرسل الصناديق كما أُغلقت، مع أسماء المحصّلين وجميع الحركات والمبالغ دون تغيير.</p>

            <div className="space-y-3">{action}</div>
        </div>
    </aside>;
}

/** The whole week in a few figures, then the one confirmation that sends it to audit. */
function SubmitModal({ week, branchId, url, notes, reviewedCount, onClose }) {
    const form = useForm({ branch_id: branchId, notes, acknowledged: false });
    const totals = week.weekTotals;
    const cell = (label, value) => <div className="bg-surface px-4 py-3"><dt className="text-xs text-gray-500">{label}</dt><dd className="font-bold text-gray-900">{value}</dd></div>;

    function submit(event) {
        event.preventDefault();
        form.post(`${url}/submit/${week.id}`, { preserveScroll: true, onSuccess: onClose });
    }

    return <Modal show onClose={onClose} maxWidth="2xl" centered><form onSubmit={submit} className="flex max-h-[90vh] flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-6 py-5">
            <div><h2 className="text-xl font-bold text-gray-900">اعتماد الأسبوع وإرساله للتدقيق</h2><p className="text-sm text-gray-500">{periodLabel(week)} · {periodRange(week)} <span className="font-display">{week.year}</span></p></div>
            <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-control p-2 text-gray-500 transition hover:bg-gray-100"><Icon name="close" className="h-5 w-5" /></button>
        </header>
        <div className="space-y-4 overflow-y-auto px-6 py-5">
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-gray-100 bg-gray-100 text-sm">
                {cell('المحصّلون', <span className="font-display">{totals.collectors}</span>)}
                {cell('الصناديق المغلقة', <span className="font-display">{totals.closedBoxes} / {totals.boxes}</span>)}
                {cell('الحركات', <span className="font-display">{totals.entries}</span>)}
                {cell('تمت مراجعتها', <span className="font-display">{reviewedCount} / {totals.boxes}</span>)}
                <div className="col-span-2 bg-surface px-4 py-3"><dt className="text-xs text-gray-500">الإجمالي</dt><dd className="text-xl font-bold text-gray-900"><BigShekels value={totals.amounts.ILS} /></dd>{foreignLine(totals.amounts) && <dd className="text-xs text-gray-500">{foreignLine(totals.amounts)}</dd>}</div>
                {notes.trim() && <div className="col-span-2 bg-surface px-4 py-3"><dt className="text-xs text-gray-500">ملاحظة الفرع</dt><dd className="text-sm text-gray-700">{notes}</dd></div>}
            </dl>
            <Notice items={week.warnings} />
            <p className="flex gap-2 rounded-control bg-sky-500/10 p-3.5 text-sm leading-7 text-sky-700 dark:text-sky-400"><Icon name="lock" className="mt-1.5 h-4 w-4 shrink-0" />تتجمّد أرقام الأسبوع لحظة الإرسال، وتصل الصناديق كما أُغلقت مع محصّليها وجميع حركاتها. أي تصحيح بعدها يُسجّل في الأسبوع المفتوح.</p>
            <label className="flex items-start gap-3 rounded-control border border-gray-200 p-3.5 text-sm font-semibold text-gray-900"><input type="checkbox" required checked={form.data.acknowledged} onChange={(event) => form.setData('acknowledged', event.target.checked)} className="mt-1" />راجعت حزمة الأسبوع وأقرّ بأن الصناديق والمبالغ صحيحة كما أُغلقت في الفرع.</label>
            {Object.values(form.errors).length > 0 && <div role="alert" className="rounded-control bg-brand-500/10 p-4 text-sm text-brand-600">{Object.values(form.errors).map((error) => <p key={error}>{error}</p>)}</div>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-4">
            <SecondaryButton type="button" onClick={onClose}>العودة للمراجعة</SecondaryButton>
            <PrimaryButton type="submit" disabled={!form.data.acknowledged || form.processing}><Icon name="send" className="h-4 w-4" />{form.processing ? 'جارٍ الإرسال…' : 'اعتماد وإرسال'}</PrimaryButton>
        </footer>
    </form></Modal>;
}

/**
 * One week's package in full: the week and its steps, its boxes by type,
 * its collectors and their boxes (or every box in one list) with each box's
 * entries a click away, and the panel that confirms the week and sends it
 * to audit.
 */
function WeekPackage({ week, branch, urls }) {
    const [type, setType] = useState('all');
    const [collector, setCollector] = useState('');
    const [review, setReview] = useState('all');
    const [search, setSearch] = useState('');
    const [view, setView] = useState('collectors');
    const [sort, setSort] = useState({ key: 'number', direction: 'asc' });
    const [reviewed, setReviewed] = useReviewedBoxes(week.id);
    const [boxId, setBoxId] = useState(null);
    const [expandedBox, setExpandedBox] = useState(false);
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [withdrawing, setWithdrawing] = useState(false);
    const canReview = !week.frozen;
    const people = useMemo(() => [...new Map(week.boxes.map((box) => [personKey(box), box.userName ?? '—'])).entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name, 'ar')), [week.boxes]);
    const [open, setOpen] = useState(() => new Set(people.slice(0, 1).map((person) => person.key)));
    const query = search.trim();
    const filtering = type !== 'all' || collector !== '' || review !== 'all' || query !== '';

    const matches = (box) => (type === 'all' || box.type === type)
        && (!collector || personKey(box) === collector)
        && (review === 'all' || (review === 'done') === reviewed.has(box.id))
        && (!query || [box.number, box.userName, ...(box.payments ?? []).flatMap((entry) => [entry.subscriber, entry.accountNumber, entry.reference, entry.voucher, entry.bankName, entry.senderName, entry.senderBank])].filter(Boolean).join(' ').includes(query));
    const matching = week.boxes.filter(matches);
    const shown = view === 'boxes' ? sortBoxes(matching, sort) : people.flatMap((person) => matching.filter((box) => personKey(box) === person.key));
    const shownTotals = addAmounts(shown.map((box) => box.amounts));
    const selectedBox = week.boxes.find((box) => box.id === boxId);
    const nextPending = (box) => {
        const start = shown.findIndex((item) => item.id === box.id);

        return [...shown.slice(start + 1), ...shown.slice(0, Math.max(start, 0))].find((item) => item.id !== box.id && !reviewed.has(item.id));
    };

    function mark(boxes, done) {
        setReviewed((current) => {
            const next = new Set(current);
            boxes.forEach((box) => (done ? next.add(box.id) : next.delete(box.id)));

            return next;
        });
    }

    function reviewAndNext() {
        const next = nextPending(selectedBox);
        mark([selectedBox], true);
        setBoxId(next?.id ?? null);
    }

    function clearFilters() {
        setType('all');
        setCollector('');
        setReview('all');
        setSearch('');
    }

    function sortBy(key) {
        setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
    }

    function toggle(key) {
        setOpen((current) => {
            const next = new Set(current);
            next.has(key) ? next.delete(key) : next.add(key);

            return next;
        });
    }

    return <div className="space-y-5 pb-24 lg:pb-0">
        <WeekBand week={week} branch={branch} />

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-5">
                <TypeCards boxes={week.boxes} type={type} onType={setType} />

                <section aria-labelledby="package-title">
                    <div className="data-table-toolbar space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 id="package-title" className="text-lg font-bold text-gray-900">{view === 'boxes' ? 'كل صناديق الأسبوع' : 'المحصّلون وصناديقهم'}</h3>
                                <p className="text-xs text-gray-500">{view === 'boxes' ? 'كل الصناديق في قائمة واحدة. افتح أي صندوق لمراجعة حركاته.' : 'افتح المحصّل لعرض صناديقه، ثم افتح الصندوق لمراجعة حركاته.'}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {view === 'collectors' && people.length > 1 && <button type="button" onClick={() => setOpen(open.size === people.length ? new Set() : new Set(people.map((person) => person.key)))} className="inline-flex items-center gap-2 rounded-control px-3 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-100"><Icon name="layers" className="h-4 w-4" />{open.size === people.length ? 'طيّ الكل' : 'توسيع الكل'}</button>}
                                <SegmentedTabs label="طريقة العرض" value={view} onChange={setView} options={VIEWS} />
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                                <div className="relative w-full sm:w-72"><Icon name="search" className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-[18px] w-[18px] text-gray-400" /><input type="text" aria-label="ابحث في الحزمة" placeholder="محصّل، رقم صندوق، مشترك، أو مرجع" value={search} onChange={(event) => setSearch(event.target.value)} className="block w-full py-2.5 pe-4 ps-10 text-sm" /></div>
                                <select aria-label="المحصّل" value={collector} onChange={(event) => setCollector(event.target.value)} className="w-full py-2.5 text-sm sm:w-56"><option value="">كل المحصّلين</option>{people.map((person) => <option key={person.key} value={person.key}>{person.name}</option>)}</select>
                            </div>
                            <SegmentedTabs label="حالة المراجعة" value={review} onChange={setReview} options={REVIEW_FILTERS} />
                        </div>
                        {filtering && <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                            {type !== 'all' && <button type="button" onClick={() => setType('all')} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 font-semibold text-gray-700 hover:bg-gray-100">{boxTypeStyles[type].label}<Icon name="close" className="h-3.5 w-3.5" /></button>}
                            <button type="button" onClick={clearFilters} className="font-semibold text-brand-600 hover:underline">مسح الفلاتر</button>
                            {canReview && shown.some((box) => !reviewed.has(box.id)) && <button type="button" onClick={() => mark(shown, true)} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-surface px-2.5 py-0.5 font-semibold text-gray-800 hover:bg-gray-100"><Icon name="check" className="h-3.5 w-3.5" />مراجعة المعروض (<span className="font-display">{shown.filter((box) => !reviewed.has(box.id)).length}</span>)</button>}
                        </div>}
                    </div>
                    <div className="data-table-container">
                        {!shown.length ? <div className="flex flex-col items-center gap-2 px-4 py-14 text-center text-gray-500"><Icon name="wallet" className="h-8 w-8 text-gray-400" /><p>{week.boxes.length ? 'لا توجد صناديق بهذه الفلاتر.' : 'لا صناديق فيها حركات في هذا الأسبوع.'}</p>{filtering && <button type="button" onClick={clearFilters} className="text-sm font-semibold text-brand-600 hover:underline">مسح الفلاتر</button>}</div>
                            : view === 'boxes' ? <div className="space-y-2 py-3"><BoxHeader withPerson sort={sort} onSort={sortBy} /><ul className="space-y-1.5">{shown.map((box) => <BoxRow key={box.id} box={box} withPerson reviewed={reviewed.has(box.id)} onOpen={setBoxId} />)}</ul></div>
                                : <div className="divide-y divide-gray-100 py-1">{people.map((person) => {
                                    const boxes = shown.filter((box) => personKey(box) === person.key);

                                    return boxes.length > 0 && <CollectorGroup key={person.key} person={person} boxes={boxes} allBoxes={week.boxes.filter((box) => personKey(box) === person.key)} open={open.has(person.key) || query !== ''} onToggle={() => toggle(person.key)} reviewed={reviewed} canReview={canReview} onMark={mark} onOpen={setBoxId} />;
                                })}</div>}
                    </div>
                    <p className="data-table-totals text-sm text-gray-600"><span>المعروض <b className="font-display text-gray-900">{shown.length}</b> من <b className="font-display text-gray-900">{week.boxes.length}</b> صندوقًا · الفلترة للعرض فقط، تُرسل الحزمة بكل صناديقها</span><span>مجموع الصناديق المعروضة: <b className="text-gray-900"><Shekels value={shownTotals.ILS} /></b>{foreignLine(shownTotals) && <span className="text-gray-500"> · {foreignLine(shownTotals)}</span>}</span></p>
                </section>
            </div>

            <ApprovalPanel week={week} reviewed={reviewed} canReview={canReview} notes={notes} onNotes={setNotes} onMarkAll={(done) => mark(week.boxes, done)} onSubmit={() => setSubmitting(true)} onWithdraw={() => setWithdrawing(true)} />
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-surface/95 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
            <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1"><p className="text-xs text-gray-500">{week.frozen ? WEEKLY_STATUSES[week.step][0] : 'إجمالي الحزمة'}</p><p className="truncate text-lg font-bold text-gray-900"><BigShekels value={week.weekTotals.amounts.ILS} /></p></div>
                {week.can.submit && <PrimaryButton type="button" disabled={week.blockers.length > 0} onClick={() => setSubmitting(true)}><Icon name="send" className="h-4 w-4" />اعتماد وإرسال</PrimaryButton>}
            </div>
        </div>

        {selectedBox && <WeeklyBoxModal box={selectedBox} list={shown.some((box) => box.id === selectedBox.id) ? shown : week.boxes} reviewed={reviewed.has(selectedBox.id)} canReview={canReview} expanded={expandedBox} onExpand={() => setExpandedBox(!expandedBox)} onReview={reviewAndNext} onUnreview={() => mark([selectedBox], false)} onOpen={setBoxId} onClose={() => setBoxId(null)} hasNextPending={Boolean(nextPending(selectedBox))} />}
        {submitting && <SubmitModal week={week} branchId={branch.id} url={urls.actions} notes={notes} reviewedCount={week.boxes.filter((box) => reviewed.has(box.id)).length} onClose={() => setSubmitting(false)} />}
        <ConfirmDialog show={withdrawing} onCancel={() => setWithdrawing(false)} onConfirm={() => router.post(`${urls.actions}/withdraw/${week.id}`, { branch_id: branch.id }, { preserveScroll: true, onFinish: () => setWithdrawing(false) })} title="سحب الأسبوع من التدقيق" message="يعود الأسبوع للمراجعة قبل أن يفتحه قسم التدقيق. تبقى النسخة المرسلة في السجل، والإرسال التالي ينشئ نسخة جديدة." confirmLabel="سحب" icon="undo" tone="danger" />
    </div>;
}

/**
 * The branch's weekly closing package: one week at a time, picked from the
 * header (the first week waiting on the branch by default), its boxes and
 * every entry in them to review, and the confirmation that sends the whole
 * week to audit.
 */
export default function WeeklyClosingsIndex({ branch, branches, started, weeks, selected, filters, years, urls }) {
    const { errors } = usePage().props;
    const [logOpen, setLogOpen] = useState(false);

    function visit(changes) {
        const query = { branch_id: branch.id, year: filters.year, ...changes };
        router.get(urls.index, Object.fromEntries(Object.entries(query).filter(([, value]) => value !== null && value !== '' && value !== undefined)), { preserveScroll: true, replace: true });
    }

    const header = <div className="flex w-full flex-wrap items-end justify-between gap-4">
        <div>
            <p className="text-sm font-semibold text-gray-500">{branches.length > 1 ? <select aria-label="الفرع" className="rounded-control border-gray-200 py-1 text-sm" value={branch.id} onChange={(event) => router.get(urls.index, { branch_id: event.target.value })}>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : branch.name}</p>
            <h2 className="mt-1 text-3xl font-bold text-gray-900">حزمة إغلاق الفرع</h2>
            <p className="mt-1 text-sm text-gray-500">راجع صناديق المحصّلين وحركاتها كما أُغلقت، ثم اعتمد الأسبوع وأرسله لقسم التدقيق.</p>
        </div>
        {started && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {years.length > 1 && <select aria-label="السنة" value={filters.year} onChange={(event) => visit({ year: event.target.value })} className="py-2.5 text-sm">{years.map((year) => <option key={year} value={year}>{year}</option>)}</select>}
            {weeks.length > 0 && <select aria-label="الأسبوع" value={selected?.id ?? ''} onChange={(event) => visit({ closing_id: event.target.value })} className="min-w-0 flex-1 py-2.5 text-sm sm:w-80 sm:flex-none">{weeks.map((week) => <option key={week.id} value={week.id}>{periodLabel(week)} · {WEEKLY_STATUSES[week.step][0]}</option>)}</select>}
            {selected && <SecondaryButton type="button" onClick={() => setLogOpen(true)}><Icon name="history" className="h-4 w-4" />سجل الحزمة</SecondaryButton>}
        </div>}
    </div>;

    return <AuthenticatedLayout header={header}>
        <Head title="الإغلاق الأسبوعي" />
        {!started ? <p className="rounded-panel border border-dashed border-gray-200 bg-surface p-6 text-sm leading-7 text-gray-500">لم يُفعّل نظام الصناديق في هذا الفرع بعد. يُفعّله مسؤول الفرع من صفحة الخزنة والكشوفات.</p> : <div className="space-y-5">
            {errors?.action && <p role="alert" className="rounded-control bg-brand-500/10 p-4 text-sm text-brand-600">{errors.action}</p>}
            {selected ? <WeekPackage key={selected.id} week={selected} branch={branch} urls={urls} />
                : <div className="flex flex-col items-center gap-2 rounded-panel border border-dashed border-gray-200 bg-surface px-4 py-14 text-center text-gray-500"><Icon name="calendar" className="h-8 w-8 text-gray-400" /><p>لا أسابيع إغلاق في <span className="font-display">{filters.year}</span> بعد.</p></div>}
        </div>}

        <Modal show={logOpen && Boolean(selected)} onClose={() => setLogOpen(false)} maxWidth="lg" centered>
            <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-5"><h2 className="text-xl font-bold text-gray-900">سجل الحزمة</h2><button type="button" onClick={() => setLogOpen(false)} aria-label="إغلاق" className="rounded-control p-2 text-gray-500 transition hover:bg-gray-100"><Icon name="close" className="h-5 w-5" /></button></header>
            {selected?.events.length ? <ol className="max-h-[70vh] overflow-y-auto px-6 py-5">{selected.events.map((event, index) => <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
                {index < selected.events.length - 1 && <span aria-hidden="true" className="absolute start-[7px] top-5 h-full w-px bg-gray-200" />}
                <span className={`relative mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full border-[3px] border-surface ring-1 ring-gray-200 ${index === 0 ? 'bg-brand-500' : 'bg-gray-300'}`} />
                <div><p className="text-sm text-gray-800">{event.description}</p><p className="text-xs text-gray-400">{event.user ?? 'النظام'} · {dateTime(event.at)}</p></div>
            </li>)}</ol> : <p className="px-6 py-10 text-center text-sm text-gray-500">لا أحداث مسجّلة لهذا الأسبوع بعد.</p>}
        </Modal>
    </AuthenticatedLayout>;
}
