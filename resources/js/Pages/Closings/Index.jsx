import { useEffect, useState } from 'react';
import { Head, Link, router, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import StatusPill from '@/Components/DataTable/StatusPill';
import SegmentedTabs from '@/Components/SegmentedTabs';
import { formatMoney } from '@/lib/format';
import { boxTypeStyles } from '../Payments/CollectorCashBox';
import { branchClock, branchDate, dateTime, periodLabel, periodRange } from '@/lib/closingPeriods';

const currencies = { ILS: 'شيكل', USD: 'دولار', JOD: 'دينار' };
const weekdays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const TABS = [['overview', 'نظرة عامة'], ['closings', 'الإغلاقات'], ['settings', 'الإعدادات']];
/** The tabs this page had before, still reached by old links: the weeks and the notes now share one tab. */
const OLD_TABS = { current: 'overview', history: 'closings', notes: 'closings' };
const WAITING_ON_BRANCH = ['awaiting_reply', 'rejected', 'collector_replied'];
const noteStatuses = {
    awaiting_reply: ['بانتظار ردّك', 'amber'],
    rejected: ['مرفوضة · تحتاج قيد تصحيح', 'red'],
    with_collector: ['عند المحصّل', 'blue'],
    collector_replied: ['ردّ المحصّل · بانتظار ردّك', 'amber'],
    awaiting_audit: ['عند التدقيق', 'blue'],
    closed: ['مغلقة', 'green'],
};
const ACTION_TITLES = { start: 'بدء الإغلاق الأسبوعي للفرع', early: 'إغلاق الأسبوع مبكرًا', repay: 'تسديد دين المحصّل', reply: 'الرد على ملاحظة التدقيق', settings: 'إعدادات الإغلاق' };

/** Each currency's sum of the entries still in effect: cash, electronic (transfers and clearings) or all. */
const totals = (payments, method = 'cash') => Object.fromEntries(Object.keys(currencies).map((currency) => [currency, payments.filter((payment) => payment.currency === currency && (method === 'all' || (method === 'electronic' ? payment.method !== 'cash' : payment.method === method)) && (!payment.transaction || payment.transaction.status === 'active')).reduce((sum, payment) => sum + Number(payment.amount), 0)]));

/** Amounts in shekels, then any other currency that is not zero: «600 شيكل · 5 دولار». */
const amountsLine = (amounts) => Object.keys(currencies).filter((currency) => currency === 'ILS' || Number(amounts[currency] ?? 0) !== 0).map((currency) => `${formatMoney(amounts[currency] ?? 0)} ${currencies[currency]}`).join(' · ');

/** «صندوق» for one, else the number and the plural: «3 صناديق». */
const plural = (count, one, many) => (count === 1 ? one : `${count.toLocaleString('en')} ${many}`);

/** How long is left until the week's cutoff, in days and hours, or hours and minutes on its last day. */
function timeLeft(milliseconds) {
    const minutes = Math.floor(milliseconds / 60000);
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor(minutes / 60) % 24;

    return days > 0 ? [days, `يوم و${hours} ساعة`] : [hours, `ساعة و${minutes % 60} دقيقة`];
}

function requestedTab() {
    const requested = new URLSearchParams(window.location.search).get('tab');

    return TABS.some(([key]) => key === requested) ? requested : (OLD_TABS[requested] ?? 'overview');
}

function requestedWeek() {
    return Number(new URLSearchParams(window.location.search).get('week')) || null;
}

/** The page's tabs beside its title, as the users page draws its own; the closings tab counts the notes waiting on the branch. */
function ClosingTabs({ tab, onChange, waitingNotes }) {
    return (
        <div role="tablist" aria-label="إدارة الإغلاق" className="inline-flex gap-0.5 rounded-xl border border-gray-100 bg-gray-100 p-[3px]">
            {TABS.map(([key, label]) => (
                <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => onChange(key)}
                    className={`inline-flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[13.5px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gray-900 ${tab === key ? 'bg-surface text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                >
                    {label}
                    {key === 'closings' && waitingNotes > 0 && <span className="rounded-full bg-brand-500 px-1.5 font-display text-xs text-white">{waitingNotes}</span>}
                </button>
            ))}
        </div>
    );
}

/** The cash collected each day of the week, today's bar in the brand's colour and days still to come left empty. */
function DailyBars({ payments, current, now }) {
    const civilDate = (value) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Gaza' }).format(new Date(value));
    const start = new Date(`${civilDate(current.coverage_from)}T00:00:00Z`);
    const end = new Date(`${civilDate(current.coverage_until)}T00:00:00Z`);
    const count = Math.min(15, Math.max(1, Math.round((end - start) / 86400000) + 1));
    const today = civilDate(now);
    const days = Array.from({ length: count }, (_, index) => {
        const from = start.getTime() + index * 86400000;
        const key = new Date(from).toISOString().slice(0, 10);

        return { from, key, amount: totals(payments.filter((payment) => civilDate(payment.occurred_at) === key)).ILS };
    });
    const max = Math.max(1, ...days.map((day) => day.amount));

    return (
        <div className="flex items-end gap-1.5" role="img" aria-label="التحصيل النقدي بالشيكل حسب اليوم">
            {days.map((day) => {
                const future = day.key > today;
                const label = new Intl.DateTimeFormat('ar', { weekday: 'short', timeZone: 'UTC' }).format(new Date(day.from)).replace('ال', '');

                return (
                    <div key={day.from} className="flex flex-col items-center gap-1.5" title={`${branchDate(day.from)} · ${future ? 'لم يأتِ بعد' : `${formatMoney(day.amount)} شيكل`}`}>
                        <div className="flex h-16 w-6 items-end border-b border-white/10">
                            {!future && <i className={`block w-full rounded-t-[5px] ${day.key === today ? 'bg-brand-500' : 'bg-white/30'}`} style={{ height: day.amount > 0 ? `${Math.max(8, (day.amount / max) * 100)}%` : '3px' }} />}
                        </div>
                        <small className={`text-[11px] ${day.key === today ? 'font-bold text-white' : 'text-white/50'}`}>{label}</small>
                    </div>
                );
            })}
        </div>
    );
}

/**
 * The week running, on the graphite card a page leads with: the cash
 * collected so far and each day's share, the electronic payments, the time
 * left until the cutoff, and the boxes open now with a link to them.
 */
function WeekHero({ current, payments, openBoxes, boxesUrl, now }) {
    const cash = totals(payments);
    const electronic = totals(payments, 'electronic');
    const entries = payments.filter((payment) => !payment.transaction || payment.transaction.status === 'active').length;
    const [left, leftUnit] = timeLeft(Math.max(0, new Date(current.coverage_until).getTime() - now));
    const collectors = new Set(openBoxes.map((box) => box.user_id)).size;
    const foreignCash = amountsLine(cash).split(' · ').slice(1).join(' · ');

    return (
        <section aria-label="الأسبوع الجاري" className="rise-in relative overflow-hidden rounded-panel bg-graphite-gradient p-6 text-white shadow-lift">
            <div className="pointer-events-none absolute -end-12 -top-20 h-60 w-60 rounded-full bg-brand-500/25 blur-3xl" aria-hidden="true" />
            <div className="relative flex flex-wrap items-start justify-between gap-6">
                <div>
                    <p className="text-sm font-semibold text-white/75">{periodLabel(current)} · {periodRange(current)}</p>
                    <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
                        <span className="font-display text-5xl font-bold">{formatMoney(cash.ILS)}</span>
                        <span className="text-base text-white/70">شيكل</span>
                    </p>
                    <p className="mt-3 text-xs text-white/60">حُصّل نقدًا هذا الأسبوع · {plural(entries, 'حركة', 'حركات')}{foreignCash && ` · و${foreignCash}`}</p>
                </div>
                <DailyBars payments={payments} current={current} now={now} />
            </div>
            <dl className="relative mt-5 grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-3">
                <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/80"><Icon name="wallet" className="h-[18px] w-[18px]" /></span>
                    <div><dt className="text-xs text-white/60">إلكتروني</dt><dd className="flex items-baseline gap-1.5"><span className="font-display text-xl font-bold">{formatMoney(electronic.ILS)}</span><span className="text-xs text-white/60">شيكل</span></dd></div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/80"><Icon name="clock" className="h-[18px] w-[18px]" /></span>
                    <div><dt className="text-xs text-white/60">يُقطع بعد · {branchDate(current.coverage_until)} {branchClock(current.coverage_until)}</dt><dd className="flex items-baseline gap-1.5"><span className="font-display text-xl font-bold">{left}</span><span className="text-xs text-white/60">{leftUnit}</span></dd></div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/80"><Icon name="lock" className="h-[18px] w-[18px]" /></span>
                    <div>
                        <dt className="text-xs text-white/60">الصناديق المفتوحة · تُغلق تلقائيًا عند القطع</dt>
                        <dd><Link href={boxesUrl} prefetch className="text-sm font-semibold text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">{openBoxes.length ? `${plural(openBoxes.length, 'صندوق', 'صناديق')} مع ${plural(collectors, 'محصّل', 'محصّلين')}` : 'لا صناديق مفتوحة'}</Link></dd>
                    </div>
                </div>
            </dl>
            <div className="brand-spectrum absolute inset-x-6 bottom-0" aria-hidden="true" />
        </section>
    );
}

const TASK_TONES = {
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    blue: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
    red: 'bg-brand-500/10 text-brand-600',
    green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
};

/** What waits on the branch now, each with the button that takes care of it; one quiet line when nothing does. */
function WaitingTasks({ tasks }) {
    const rows = tasks.length ? tasks : [{ key: 'none', tone: 'green', icon: 'check', label: 'لا شيء ينتظرك الآن', hint: 'كل الصناديق والأسابيع وملاحظات التدقيق في وضعها الصحيح.' }];

    return (
        <section aria-labelledby="waiting-tasks" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="waiting-tasks" className="text-lg font-bold text-gray-900">ما ينتظرك الآن</h3>
                <p className="text-xs text-gray-500">الصناديق بانتظار تأكيد إغلاقها، والأسابيع الجاهزة للإرسال، وملاحظات التدقيق.</p>
            </div>
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-panel border border-gray-100 bg-surface shadow-card">
                {rows.map((task) => (
                    <li key={task.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TASK_TONES[task.tone]}`}><Icon name={task.icon} className="h-5 w-5" /></span>
                        <div className="min-w-0 flex-1 basis-56">
                            <p className="font-semibold text-gray-900">{task.label}</p>
                            <p className="mt-0.5 text-xs leading-5 text-gray-500">{task.hint}</p>
                        </div>
                        {task.onClick && <SecondaryButton onClick={task.onClick} className="px-3 py-2">{task.action}<Icon name="chevron-left" className="h-4 w-4" /></SecondaryButton>}
                    </li>
                ))}
            </ul>
        </section>
    );
}

function PersonAvatar({ name }) {
    return <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-gray-900 text-xs font-semibold text-surface">{(name ?? '—').trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('')}</span>;
}

/** A card of the closings and settings tabs: an icon, a title and what it is for, an action, and what it holds. */
function Panel({ icon, title, hint, action, children }) {
    return (
        <section className="rounded-panel border border-gray-100 bg-surface p-6 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-gray-500"><Icon name={icon} className="h-5 w-5" /></span>
                    <div><h3 className="text-lg font-bold text-gray-900">{title}</h3>{hint && <p className="mt-0.5 text-sm text-gray-500">{hint}</p>}</div>
                </div>
                {action}
            </div>
            {children && <div className="mt-5">{children}</div>}
        </section>
    );
}

function EmptyState({ icon, title, hint }) {
    return (
        <div className="rounded-panel border border-dashed border-gray-200 bg-surface px-5 py-12 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-gray-50 text-gray-400"><Icon name={icon} className="h-5 w-5" /></span>
            <p className="mt-3 font-semibold text-gray-900">{title}</p>
            {hint && <p className="mt-1 text-sm text-gray-500">{hint}</p>}
        </div>
    );
}

/** Where a week stands, as its status pill says it: running, waiting to be sent, with the audit, or the audit's answer. */
function weekStatus(week) {
    if (week.step === 'review') {
        return ['جارٍ', 'blue'];
    }
    if (week.step === 'confirm') {
        return ['بانتظار الإرسال', 'amber'];
    }
    if (week.step === 'audit') {
        return ['عند التدقيق', 'gray'];
    }
    if (week.waitingNotes > 0) {
        return ['ملاحظات تنتظر ردّك', 'red'];
    }
    if (week.openNotes > 0) {
        return ['ردودك عند التدقيق', 'blue'];
    }

    return week.status === 'approved' ? ['معتمد', 'green'] : week.status === 'returned' ? ['أُعيد للفرع', 'red'] : ['بملاحظات', 'amber'];
}

/** What an audit note is about, when it names no entry: its box, else the whole week. */
function NoteSubject({ note }) {
    return <span className="text-gray-500">{note.box ? 'الصندوق كله' : 'الأسبوع كله'}</span>;
}

/**
 * The audit's statement on one week: only the entries it has notes on,
 * every other entry of the week being sound, in the site's table, one per row:
 * the entry (subscriber, voucher, date), its type and amount, the box it
 * sits in and whose it is, who recorded it, the auditor's note with the
 * replies so far, its state, and the button to answer it while it waits
 * on the branch.
 */
function NotesTable({ notes, access, urls, onAction }) {
    return (
        <div className="data-table-container">
            <table className="data-table w-full text-start text-sm">
                <thead><tr><th>الحركة</th><th>النوع</th><th>المبلغ</th><th>المكان</th><th>سجّلها</th><th>ملاحظة التدقيق</th><th>الحالة</th><th /></tr></thead>
                <tbody>
                    {[...notes].sort((first, second) => WAITING_ON_BRANCH.includes(second.status) - WAITING_ON_BRANCH.includes(first.status) || first.id - second.id).map((note) => {
                        const [status, tone] = noteStatuses[note.status] ?? [note.status, 'gray'];
                        const ledger = note.entry?.ledger;
                        const differences = Object.entries(note.differences ?? {}).filter(([, amount]) => Number(amount) !== 0);

                        return (
                            <tr key={note.id}>
                                <td style={{ whiteSpace: 'normal' }}>
                                    {note.entry ? <>
                                        <Link href={note.entry.statementUrl} prefetch className="font-semibold text-gray-900 hover:text-brand-600">{note.entry.subscriber}</Link>
                                        {ledger.voucherNumber && <span className="block text-xs text-gray-500">سند <bdi dir="ltr" className="font-display">{ledger.voucherNumber}</bdi></span>}
                                        <span className="block whitespace-nowrap text-xs text-gray-500"><bdi dir="ltr" className="font-display">{ledger.date}</bdi></span>
                                    </> : <NoteSubject note={note} />}
                                </td>
                                <td style={{ whiteSpace: 'normal' }}>
                                    {ledger ? <>
                                        <span className="block text-gray-900">{ledger.typeLabel}{ledger.paymentMethodLabel && ` · ${ledger.paymentMethodLabel}`}</span>
                                        {(ledger.referenceNumber || ledger.bankName) && <span className="block text-xs text-gray-500">{ledger.referenceNumber && <bdi dir="ltr" className="font-display">{ledger.referenceNumber}</bdi>}{ledger.referenceNumber && ledger.bankName && ' · '}{ledger.bankName}</span>}
                                    </> : <span className="text-gray-400">—</span>}
                                </td>
                                <td>
                                    {note.entry ? <span className="whitespace-nowrap"><b className="font-display text-gray-900">{formatMoney(note.entry.amount)}</b> <span className="text-xs text-gray-500">{currencies[note.entry.currency]}</span></span> : <span className="text-gray-400">—</span>}
                                    {differences.map(([currency, amount]) => <span key={currency} className="block whitespace-nowrap text-xs font-semibold text-brand-600">فرق <bdi dir="ltr" className="font-display">{formatMoney(amount)}</bdi> {currencies[currency]}</span>)}
                                </td>
                                <td style={{ whiteSpace: 'normal' }}>
                                    {note.box ? <>
                                        <Link href={note.box.url} prefetch className="font-semibold text-brand-600 hover:underline">صندوق <bdi dir="ltr" className="font-display">{note.box.number}</bdi></Link>
                                        <span className="block text-xs text-gray-500">{boxTypeStyles[note.box.type].label}{note.box.person && <> · <bdi>{note.box.person}</bdi></>}</span>
                                    </> : <span className="text-gray-400">—</span>}
                                </td>
                                <td>{ledger?.recordedByName ? <bdi>{ledger.recordedByName}</bdi> : <span className="text-gray-400">—</span>}</td>
                                <td style={{ whiteSpace: 'normal', minWidth: '16rem' }}>
                                    <p className="leading-6 text-gray-800">{note.body}</p>
                                    {note.replies.length > 0 && (
                                        <ol className="mt-2 space-y-1.5 border-s-2 border-gray-100 ps-3">
                                            {note.replies.map((reply) => (
                                                <li key={reply.id} className="text-xs leading-5 text-gray-600">
                                                    <b className="font-semibold text-gray-700"><bdi>{reply.user?.name}</bdi>:</b> {reply.body}
                                                    {reply.document_path && <a href={`${urls.proofs}/reply/${reply.id}`} className="ms-1 inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline"><Icon name="eye" className="h-3.5 w-3.5" />المستند</a>}
                                                </li>
                                            ))}
                                        </ol>
                                    )}
                                </td>
                                <td><StatusPill tone={tone} label={status} /></td>
                                <td className="text-end">{access.approve && WAITING_ON_BRANCH.includes(note.status) && <PrimaryButton className="px-3 py-2" onClick={() => onAction('reply', note)}>الرد</PrimaryButton>}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/** The collectors' debts left from the audit's decisions, each repaid in cash by those who receive the branch's boxes. */
function DebtsPanel({ debts, access, actorId, onAction }) {
    return (
        <Panel icon="currency" title="ديون المحصّلين" hint="يبقى الدين ظاهرًا حتى يُسدَّد بالكامل.">
            <ul className="divide-y divide-gray-100">
                {debts.map((debt) => (
                    <li key={debt.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <PersonAvatar name={debt.user?.name} />
                        <b className="min-w-0 flex-1 font-semibold text-gray-900">{debt.user?.name}</b>
                        <span><b className="font-display text-gray-900">{formatMoney(debt.remaining)}</b> <span className="text-xs text-gray-500">{currencies[debt.currency]}</span></span>
                        {access.receive && debt.user_id !== actorId && <SecondaryButton className="px-3 py-2" onClick={() => onAction('repay', debt)}>تسديد نقدًا</SecondaryButton>}
                    </li>
                ))}
            </ul>
        </Panel>
    );
}

const WEEK_FILTERS = [
    ['all', 'الكل', () => true],
    ['waiting', 'تنتظر ردّك', (week) => week.waitingNotes > 0],
    ['confirm', 'بانتظار الإرسال', (week) => week.step === 'confirm'],
    ['audit', 'عند التدقيق', (week) => week.step === 'audit' || (week.waitingNotes === 0 && week.openNotes > 0)],
];

/**
 * Every week of the branch, newest first, in the site's table: its dates,
 * boxes, entries and totals, where it stands and its audit notes, how
 * many of them wait on the branch. A week opens with its notes to answer.
 */
function WeeksTable({ weeks, filter, onFilter, onOpen, debts, access, actorId, onAction }) {
    const [, , matches] = WEEK_FILTERS.find(([key]) => key === filter) ?? WEEK_FILTERS[0];
    const shown = weeks.filter(matches);

    return (
        <div className="space-y-5">
            <p className="flex items-center gap-2 text-sm text-gray-500"><Icon name="shield" className="h-4 w-4 shrink-0" /><span>افتح أي أسبوع لترى ملاحظات قسم التدقيق عليه وترد عليها. الأسبوع المرسل لا يتغيّر، وكل تصحيح يُقيَّد في الأسبوع المفتوح.</span></p>
            {debts.length > 0 && <DebtsPanel debts={debts} access={access} actorId={actorId} onAction={onAction} />}
            <section aria-label="الإغلاقات" className="space-y-3">
                <SegmentedTabs label="حالة الأسبوع" value={filter} onChange={onFilter} options={WEEK_FILTERS.map(([key, label, test]) => ({ value: key, label: <>{label} · <span className="font-display">{weeks.filter(test).length}</span></> }))} />
                <div className="data-table-container">
                    <table className="data-table w-full text-start text-sm">
                        <thead><tr><th>الأسبوع</th><th>الفترة</th><th>الصناديق</th><th>الحركات</th><th>الإجمالي</th><th>الحالة</th><th>ملاحظات التدقيق</th><th /></tr></thead>
                        <tbody>
                            {shown.length === 0 ? <tr><td colSpan="8" className="text-center text-gray-500">لا أسابيع بهذه الحالة.</td></tr> : shown.map((week) => {
                                const [status, tone] = weekStatus(week);

                                return (
                                    <tr key={week.id} className="cursor-pointer" onClick={() => onOpen(week.id)}>
                                        <td><b className="font-semibold text-gray-900">{periodLabel(week)}</b>{week.is_manual && <span className="block text-xs text-gray-400">إغلاق مبكر</span>}</td>
                                        <td className="whitespace-nowrap text-gray-600">{periodRange(week)}</td>
                                        <td className="font-display text-gray-900">{week.boxes}</td>
                                        <td className="font-display text-gray-900">{week.entries}</td>
                                        <td><b className="font-display text-gray-900">{formatMoney(week.amounts.ILS ?? 0)}</b> <span className="text-xs text-gray-500">شيكل</span></td>
                                        <td><StatusPill tone={tone} label={status} /></td>
                                        <td>{week.notes ? <><span className="block text-gray-700">{plural(week.notes, 'ملاحظة واحدة', 'ملاحظات')}</span>{week.waitingNotes > 0 && <span className="block text-xs font-semibold text-brand-600">{week.waitingNotes === 1 ? 'واحدة تنتظر ردّك' : `${week.waitingNotes} تنتظر ردّك`}</span>}</> : <span className="text-gray-400">—</span>}</td>
                                        <td className="text-end"><SecondaryButton className="px-3 py-2" onClick={(event) => { event.stopPropagation(); onOpen(week.id); }}>فتح<Icon name="chevron-left" className="h-4 w-4" /></SecondaryButton></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

/**
 * One week opened from the table: where it stands and what it held, a
 * link to its boxes on the weekly closing page, the audit's statement of
 * the entries it has notes on, to answer, and the corrections entered for
 * it in later weeks.
 */
function WeekView({ week, notes, adjustments, closings, access, urls, branch, onBack, onAction }) {
    const [status, tone] = weekStatus(week);
    const quiet = { review: 'الأسبوع جارٍ؛ تصل ملاحظات قسم التدقيق بعد إرساله.', confirm: 'لم يُرسل الأسبوع إلى التدقيق بعد.', audit: 'الأسبوع عند قسم التدقيق، ولم يكتب ملاحظات عليه بعد.' }[week.step] ?? 'اعتمد قسم التدقيق الأسبوع دون ملاحظات.';
    const books = { cash: 'النقد', bank: 'الإلكتروني' };
    const noted = new Set(notes.filter((note) => note.cash_box_payment_id).map((note) => note.cash_box_payment_id)).size;

    return (
        <div className="space-y-5">
            <SecondaryButton className="px-3 py-2" onClick={onBack}><Icon name="chevron-right" className="h-4 w-4" />كل الإغلاقات</SecondaryButton>
            <section className="rounded-panel border border-gray-100 bg-surface p-6 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex flex-wrap items-center gap-3"><h3 className="text-2xl font-bold text-gray-900">{periodLabel(week)}</h3><StatusPill tone={tone} label={status} /></div>
                        <p className="mt-1 text-sm text-gray-500">{periodRange(week)}{week.sentAt && ` · أُرسل ${dateTime(week.sentAt)}`}</p>
                    </div>
                    {week.step === 'confirm'
                        ? <PrimaryButton onClick={() => router.get(urls.weekly, { branch_id: branch.id, closing_id: week.id })}><Icon name="layers" className="h-4 w-4" />مراجعة وإرسال</PrimaryButton>
                        : <SecondaryButton onClick={() => router.get(urls.weekly, { branch_id: branch.id, closing_id: week.id })}><Icon name="table" className="h-4 w-4" />الصناديق والحركات</SecondaryButton>}
                </div>
                <dl className="mt-5 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-3">
                    <div><dt className="text-xs text-gray-500">الصناديق</dt><dd className="font-display text-xl font-bold text-gray-900">{week.boxes}</dd></div>
                    <div><dt className="text-xs text-gray-500">الحركات</dt><dd className="font-display text-xl font-bold text-gray-900">{week.entries}</dd></div>
                    <div><dt className="text-xs text-gray-500">الإجمالي</dt><dd className="text-xl font-bold text-gray-900">{amountsLine(week.amounts)}</dd></div>
                </dl>
            </section>
            <section aria-labelledby="week-notes" className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 id="week-notes" className="text-lg font-bold text-gray-900">كشف ملاحظات التدقيق</h3>
                    {notes.length > 0 && <p className="text-xs text-gray-500">{noted > 0 && `${plural(noted, 'حركة واحدة عليها ملاحظة', 'حركات عليها ملاحظات')} من أصل ${week.entries}؛ `}كل حركة لم ترد في الكشف سليمة.</p>}
                </div>
                {notes.length === 0 ? <EmptyState icon="messages" title="لا ملاحظات على هذا الأسبوع" hint={quiet} /> : <NotesTable notes={notes} access={access} urls={urls} onAction={onAction} />}
            </section>
            {adjustments.length > 0 && (
                <Panel icon="pencil" title="قيود التصحيح لهذا الأسبوع" hint={`قُيّدت في أسابيع لاحقة، و${periodLabel(week)} باقٍ كما أُرسل.`}>
                    <ul className="divide-y divide-gray-100">
                        {adjustments.map((adjustment) => (
                            <li key={adjustment.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3 text-sm first:pt-0 last:pb-0">
                                <b className={Number(adjustment.amount) < 0 ? 'text-brand-600' : 'text-emerald-700 dark:text-emerald-400'}><bdi dir="ltr" className="font-display">{formatMoney(adjustment.amount)}</bdi> {currencies[adjustment.currency]}</b>
                                <span className="text-gray-500">{books[adjustment.book] ?? adjustment.book} · قُيّد في {periodLabel(closings.find((closing) => closing.id === adjustment.closing_id))}</span>
                                <span className="basis-full text-gray-700">{adjustment.reason}</span>
                            </li>
                        ))}
                    </ul>
                </Panel>
            )}
        </div>
    );
}

/** The week's schedule, an early close and who may close boxes or submit the week, each in its own panel. */
function SettingsTab({ settings, current, pendingChange, staff, receivers, approvers, access, onAction }) {
    const granted = (person, list) => person.isBranchAdmin ? ['green', 'مسؤول الفرع'] : list.includes(person.id) ? ['green', 'مفوّض'] : ['gray', 'غير مفوّض'];

    return (
        <div className="space-y-5">
            {pendingChange && (
                <p role="status" className="flex items-start gap-2 rounded-panel border border-sky-500/25 bg-sky-500/10 p-4 text-sm leading-7 text-sky-700 dark:text-sky-400">
                    <Icon name="clock" className="mt-1 h-4 w-4 shrink-0" />
                    <span>موعد جديد يبدأ من {dateTime(pendingChange.effective_from)}: يبدأ الأسبوع يوم {weekdays[pendingChange.settings.week_starts_on]}، والقطع الساعة <bdi dir="ltr" className="font-display">{pendingChange.settings.cutoff_time}</bdi>.</span>
                </p>
            )}
            <Panel icon="calendar" title="موعد القطع الأسبوعي" hint="يبدأ أي تغيير من الأسبوع القادم، ويُحفظ في السجل." action={access.manage && <SecondaryButton className="px-3 py-2" onClick={() => onAction('settings')}><Icon name="cog" className="h-4 w-4" />تعديل الموعد</SecondaryButton>}>
                <div className="grid gap-5 lg:grid-cols-2">
                    <div className="space-y-2">
                        <p className="text-sm font-semibold text-gray-700">يبدأ الأسبوع يوم</p>
                        <ul className="inline-flex flex-wrap gap-0.5 rounded-control border border-gray-100 bg-surface p-[3px] shadow-sm">
                            {[6, 0, 1, 2, 3, 4, 5].map((index) => {
                                const chosen = Number(settings.week_starts_on) === index;

                                return <li key={index} aria-current={chosen ? 'true' : undefined} className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ${chosen ? 'bg-gray-900 text-surface shadow-sm' : 'text-gray-500'}`}>{weekdays[index]}</li>;
                            })}
                        </ul>
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-semibold text-gray-700">وقت القطع</p>
                        <p className="flex items-baseline gap-2"><b dir="ltr" className="font-display text-3xl text-gray-900">{settings.cutoff_time}</b><span className="text-sm text-gray-500">بتوقيت الفرع</span></p>
                    </div>
                </div>
                <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-gray-500"><Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0" /><span>كل دفعة بعد القطع تدخل في الأسبوع التالي، وتُغلق الصناديق المفتوحة تلقائيًا. يضم الإغلاق الأسبوعي النقد والحوالات والمقاصات معًا.</span></p>
            </Panel>
            <Panel icon="bolt" title="الإغلاق المبكر" hint="يُغلق الأسبوع الجاري الآن مع كل صناديقه المفتوحة، وتنضم الأيام الباقية إلى الأسبوع القادم دون تغيير يوم البداية." action={access.approve && current && <SecondaryButton className="px-3 py-2" onClick={() => onAction('early', current)}><Icon name="bolt" className="h-4 w-4" />إغلاق {periodLabel(current)} مبكرًا</SecondaryButton>} />
            <Panel icon="users" title="التفويضات" hint="من يراجع صناديق الآخرين ويؤكد إغلاقها، ومن يعتمد الأسبوع ويرسله. تسري فورًا." action={access.manage && <SecondaryButton className="px-3 py-2" onClick={() => onAction('settings')}><Icon name="cog" className="h-4 w-4" />تعديل التفويضات</SecondaryButton>}>
                <div className="data-table-container">
                    <table className="data-table w-full text-start text-sm">
                        <thead><tr><th>الموظف</th><th>مراجعة الصناديق وتأكيد إغلاقها</th><th>اعتماد الأسبوع وإرساله</th></tr></thead>
                        <tbody>
                            {staff.map((person) => {
                                const [receiveTone, receiveLabel] = granted(person, receivers);
                                const [approveTone, approveLabel] = granted(person, approvers);

                                return <tr key={person.id}><td><span className="flex items-center gap-3"><PersonAvatar name={person.name} /><b className="font-semibold text-gray-900">{person.name}</b></span></td><td><StatusPill tone={receiveTone} label={receiveLabel} /></td><td><StatusPill tone={approveTone} label={approveLabel} /></td></tr>;
                            })}
                        </tbody>
                    </table>
                </div>
                <p className="mt-3 text-xs leading-5 text-gray-500">مسؤول الفرع والمفوّض بالاعتماد يؤكدان إغلاق صناديقهما. المفوّض بالمراجعة وحده يؤكد إغلاق صناديق الآخرين.</p>
            </Panel>
        </div>
    );
}

function Field({ label, children }) {
    return <label className="grid gap-2 text-sm font-semibold text-gray-700">{label}{children}</label>;
}

/** The length of the week after a change of schedule, from the end of the week running, in the branch's time. */
function TransitionPreview({ from, settings }) {
    if (!from) {
        return null;
    }
    // Use the branch's civil date; UTC arithmetic here avoids the browser's local timezone.
    const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(from));
    const parts = Object.fromEntries(local.map((part) => [part.type, part.value]));
    const start = new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
    const [hours, minutes] = settings.cutoff_time.split(':').map(Number);
    const end = new Date(start);
    end.setUTCHours(hours, minutes, 0, 0);
    end.setUTCDate(end.getUTCDate() + (Number(settings.week_starts_on) - end.getUTCDay() + 7) % 7);
    if (end <= start) {
        end.setUTCDate(end.getUTCDate() + 7);
    }
    const days = (end - start) / 86400000;

    return <p className="rounded-xl border border-gray-200 p-4 text-sm text-gray-700">طول الفترة القادمة: <b className="font-display">{days.toFixed(2)}</b> يوم، وتنتهي <b dir="ltr" className="font-display">{end.toISOString().slice(0, 10)} {settings.cutoff_time}</b> بتوقيت الفرع.</p>;
}

/** The page's forms in one dialog: starting the weekly closing, an early close, a debt repaid, an answer to the audit, and the settings. */
function ActionModal({ action, onClose, props }) {
    const { branch, urls, staff, settings, receivers, approvers, current } = props;
    const form = useForm({ branch_id: branch.id, decisions: { ILS: 'accepted', USD: 'accepted', JOD: 'accepted' }, amount: '', currency: 'ILS', kind: 'clarification', body: '', document: null, book: 'cash', settings: { week_starts_on: settings.week_starts_on, cutoff_time: settings.cutoff_time }, receivers: [...receivers], approvers: [...approvers] });
    const record = action.record;

    function submit(event) {
        event.preventDefault();
        form.post(`${urls.actions}/${action.kind}${record?.id ? `/${record.id}` : ''}`, { preserveScroll: true, onSuccess: onClose });
    }

    function toggleGrant(key, id) {
        form.setData(key, form.data[key].includes(id) ? form.data[key].filter((value) => value !== id) : [...form.data[key], id]);
    }

    return (
        <Modal show onClose={onClose} maxWidth="2xl" centered>
            <form onSubmit={submit} className="flex max-h-[90vh] flex-col">
                <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-5">
                    <div><h2 className="text-xl font-bold text-gray-900">{ACTION_TITLES[action.kind]}</h2><p className="mt-1 text-sm text-gray-500">{action.kind === 'reply' ? `ملاحظة #${record.id}` : action.kind === 'repay' ? record.user?.name : branch.name}</p></div>
                    <button type="button" onClick={onClose} aria-label="إغلاق النافذة" className="rounded-lg p-2 text-gray-500 hover:bg-gray-50"><Icon name="close" className="h-5 w-5" /></button>
                </header>
                <div className="space-y-5 overflow-y-auto p-6">
                    {action.kind === 'start' && <p className="text-sm leading-7 text-gray-700">يبدأ مسار الإغلاق الأسبوعي من هذه اللحظة، وتدخل فيه الدفعات الجديدة. تبقى الإغلاقات السابقة محفوظة. حدّد يوم البداية ووقت القطع لاحقًا من تبويب الإعدادات.</p>}
                    {action.kind === 'early' && <p className="text-sm leading-7 text-gray-700">يُغلق {periodLabel(record)} الآن وتُغلق صناديقه المفتوحة، وتنضم الأيام الباقية إلى الأسبوع القادم حتى موعد قطعه.</p>}
                    {action.kind === 'repay' && <Field label={`المبلغ نقدًا · المتبقي ${formatMoney(record.remaining)} ${currencies[record.currency]}`}><input required type="number" min="0.01" step="0.01" dir="ltr" className="w-full" value={form.data.amount} onChange={(event) => form.setData('amount', event.target.value)} /></Field>}
                    {action.kind === 'reply' && <>
                        <div className="rounded-xl bg-gray-50 p-4 text-sm leading-7 text-gray-700">
                            {record.entry && <p className="mb-2 border-b border-gray-200 pb-2 text-xs text-gray-500"><b className="text-gray-900">{record.entry.subscriber}</b> · {record.entry.ledger.typeLabel}{record.entry.ledger.paymentMethodLabel && ` · ${record.entry.ledger.paymentMethodLabel}`} · <bdi dir="ltr" className="font-display">{formatMoney(record.entry.amount)}</bdi> {currencies[record.entry.currency]}{record.box && <> · صندوق <bdi dir="ltr" className="font-display">{record.box.number}</bdi></>}{record.entry.ledger.recordedByName && <> · سجّلها <bdi>{record.entry.ledger.recordedByName}</bdi></>}</p>}
                            {record.body}
                        </div>
                        <Field label="نوع الرد">
                            <select className="w-full" value={form.data.kind} onChange={(event) => form.setData('kind', event.target.value)}>
                                <option value="clarification">اعتراض أو توضيح</option>
                                <option value="adjustment">صحّحت بقيد في الأسبوع المفتوح</option>
                                <option value="document">إرفاق مستند</option>
                                {record.cash_box_id && <option value="collector">تحويلها للمحصّل</option>}
                            </select>
                        </Field>
                        <Field label="الرد أو سبب التصحيح"><textarea required rows="3" className="w-full" value={form.data.body} onChange={(event) => form.setData('body', event.target.value)} /></Field>
                        {record.differences && !record.difference_decisions && form.data.kind !== 'collector' && (
                            <div className="space-y-3 rounded-xl border border-gray-200 p-4">
                                <h3 className="text-sm font-bold text-gray-900">قرار فروقات التدقيق</h3>
                                {Object.entries(record.differences).filter(([, amount]) => Number(amount) !== 0).map(([currency, amount]) => (
                                    <Field key={currency} label={<span>{currencies[currency]} · فرق <bdi dir="ltr" className="font-display">{formatMoney(amount)}</bdi></span>}>
                                        <select className="w-full" value={form.data.decisions[currency]} onChange={(event) => form.setData('decisions', { ...form.data.decisions, [currency]: event.target.value })}>
                                            <option value="accepted">قبول السبب أو الزيادة للشركة</option>
                                            {Number(amount) < 0 && <option value="debt">رفض السبب · دين على المحصّل</option>}
                                        </select>
                                    </Field>
                                ))}
                            </div>
                        )}
                        {form.data.kind === 'document' && <Field label="المستند"><input required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => form.setData('document', event.target.files[0])} /></Field>}
                        {form.data.kind === 'adjustment' && (
                            <div className="grid gap-3 sm:grid-cols-3">
                                <Field label="الدفتر"><select className="w-full" value={form.data.book} onChange={(event) => form.setData('book', event.target.value)}><option value="cash">النقد</option><option value="bank">الإلكتروني</option></select></Field>
                                <Field label="العملة"><select className="w-full" value={form.data.currency} onChange={(event) => form.setData('currency', event.target.value)}>{Object.entries(currencies).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
                                <Field label="المبلغ (+ / −)"><input required type="number" step="0.01" dir="ltr" className="w-full" value={form.data.amount} onChange={(event) => form.setData('amount', event.target.value)} /></Field>
                                <p className="flex items-start gap-2 text-xs leading-5 text-gray-500 sm:col-span-3"><Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" /><span>يُقيَّد في {periodLabel(current)} المفتوح، مرتبطًا بـ{periodLabel(record.closing)}، ويبقى {periodLabel(record.closing)} كما أُرسل.</span></p>
                            </div>
                        )}
                    </>}
                    {action.kind === 'settings' && <>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="يوم بداية الأسبوع"><select className="w-full" value={form.data.settings.week_starts_on} onChange={(event) => form.setData('settings', { ...form.data.settings, week_starts_on: Number(event.target.value) })}>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></Field>
                            <Field label="وقت القطع"><input required type="time" className="w-full" value={form.data.settings.cutoff_time} onChange={(event) => form.setData('settings', { ...form.data.settings, cutoff_time: event.target.value })} /></Field>
                        </div>
                        <p className="rounded-xl bg-sky-500/10 p-4 text-sm leading-7 text-sky-700 dark:text-sky-400">يسري تغيير الموعد بعد {dateTime(current?.scheduled_until)}، وتسري التفويضات فورًا.</p>
                        <TransitionPreview from={current?.scheduled_until} settings={form.data.settings} />
                        <fieldset className="space-y-3">
                            <legend className="font-bold text-gray-900">التفويضات</legend>
                            {staff.filter((person) => !person.isBranchAdmin).map((person) => (
                                <div key={person.id} className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
                                    <b className="min-w-28 flex-1">{person.name}</b>
                                    {[['receivers', 'مراجعة الصناديق وتأكيد إغلاقها'], ['approvers', 'اعتماد الأسبوع وإرساله']].map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={form.data[key].includes(person.id)} onChange={() => toggleGrant(key, person.id)} />{label}</label>)}
                                </div>
                            ))}
                        </fieldset>
                    </>}
                    {Object.keys(form.errors).length > 0 && <div role="alert" className="rounded-xl bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-400">{Object.entries(form.errors).map(([key, error]) => <p key={key}>{error}</p>)}</div>}
                    {form.progress && <progress className="w-full" value={form.progress.percentage} max="100" />}
                </div>
                <footer className="flex justify-end gap-3 border-t border-gray-100 p-5">
                    <SecondaryButton onClick={onClose}>إلغاء</SecondaryButton>
                    <PrimaryButton type="submit" disabled={form.processing}>{form.processing ? 'جارٍ الحفظ…' : 'تأكيد وحفظ'}</PrimaryButton>
                </footer>
            </form>
        </Modal>
    );
}

/**
 * Closing management, for the branch's manager and those they delegate:
 * where the week running stands and what waits on them now (boxes to
 * confirm closed, weeks ready to submit, audit notes, payments not found
 * in the bank, collectors' debts); every week in a table, each opened with
 * the audit's notes on it to answer; and the weekly schedule with who may
 * close boxes or submit the week. A week's boxes are looked over on the
 * weekly closing page.
 */
export default function ClosingsIndex(props) {
    const { branch, branches, started, current, closings, weeks, boxes, debts, notes, adjustments, access, urls, actorId, errors } = props;
    const [tab, setTab] = useState(requestedTab);
    const [weekId, setWeekId] = useState(requestedWeek);
    const [weekFilter, setWeekFilter] = useState(() => (weeks.some((week) => week.waitingNotes > 0) ? 'waiting' : 'all'));
    const [action, setAction] = useState(null);
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60000);

        return () => clearInterval(timer);
    }, []);

    const active = (payment) => !payment.transaction || payment.transaction.status === 'active';
    const periodPayments = boxes.filter((box) => closings.find((closing) => closing.id === box.closing_id)?.coverage_from === current?.coverage_from).flatMap((box) => box.payments);
    const openBoxes = boxes.filter((box) => box.status === 'open');
    const pendingBoxes = boxes.filter((box) => box.status === 'pending');
    const unmatched = boxes.flatMap((box) => box.payments).filter((payment) => payment.method !== 'cash' && ['missing', 'rejected'].includes(payment.status) && active(payment));
    const overdue = closings.filter((closing) => !closing.submitted_snapshot && new Date(closing.coverage_until).getTime() <= now).sort((first, second) => new Date(first.coverage_from) - new Date(second.coverage_from));
    const waitingNotes = notes.filter((note) => WAITING_ON_BRANCH.includes(note.status));
    const owing = debts.filter((debt) => Number(debt.remaining) > 0);
    const boxesUrl = branches.length > 1 ? `${urls.boxes}?branch_id=${branch.id}` : urls.boxes;

    function go(nextTab, nextWeek = null) {
        setTab(nextTab);
        setWeekId(nextWeek);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', nextTab);
        if (nextWeek) {
            url.searchParams.set('week', nextWeek);
        } else {
            url.searchParams.delete('week');
        }
        window.history.replaceState(window.history.state, '', url);
        window.scrollTo({ top: 0 });
    }

    const openedWeek = tab === 'closings' && weeks.find((week) => week.id === weekId);
    const weeksWaiting = weeks.filter((week) => week.waitingNotes > 0);

    /** The week whose notes wait on the branch, or the weeks' table showing only those when there are several. */
    function openWaitingNotes() {
        if (weeksWaiting.length === 1) {
            go('closings', weeksWaiting[0].id);

            return;
        }
        setWeekFilter('waiting');
        go('closings');
    }

    function openWeek(closing) {
        router.get(urls.weekly, { branch_id: branch.id, closing_id: closing.id });
    }

    const tasks = [
        overdue.length > 0 && { key: 'overdue', tone: 'blue', icon: 'layers', label: overdue.length === 1 ? `${periodLabel(overdue[0])} جاهز للإرسال` : `${plural(overdue.length, 'أسبوع', 'أسابيع')} جاهزة للإرسال`, hint: 'أكمل النواقص ثم اعتمد الأسبوع وأرسله إلى التدقيق، الأقدم أولًا.', action: 'مراجعة وإرسال', onClick: () => openWeek(overdue[0]) },
        pendingBoxes.length > 0 && { key: 'pending', tone: 'amber', icon: 'table', label: `${plural(pendingBoxes.length, 'صندوق', 'صناديق')} بانتظار تأكيد الإغلاق`, hint: pendingBoxes.length === 1 ? `فيه ${amountsLine(totals(pendingBoxes[0].payments))} نقدًا. اطّلع على حركاته، واطلب من المحصّل تصحيح ما فيه خطأ، ثم أكّد إغلاقه.` : `فيها ${amountsLine(totals(pendingBoxes.flatMap((box) => box.payments)))} نقدًا. اطّلع على حركاتها، واطلب من المحصّل تصحيح ما فيه خطأ، ثم أكّد إغلاقها.`, action: 'مراجعة', onClick: () => router.visit(boxesUrl) },
        waitingNotes.length > 0 && { key: 'notes', tone: 'red', icon: 'messages', label: `${plural(waitingNotes.length, 'ملاحظة تدقيق تنتظر', 'ملاحظات تدقيق تنتظر')} ردّك`, hint: `على ${weeksWaiting.map((week) => periodLabel(week)).join(' و')}. الأسبوع المرسل لا يتغيّر؛ كل تصحيح يُقيَّد في الأسبوع المفتوح.`, action: 'الرد', onClick: openWaitingNotes },
        unmatched.length > 0 && { key: 'unmatched', tone: 'amber', icon: 'bank', label: `${plural(unmatched.length, 'حركة إلكترونية لم تُطابق', 'حركات إلكترونية لم تُطابق')}`, hint: 'حوالات غير موجودة في البنك أو مقاصات مرفوضة. تنتقل إلى الأسبوع التالي حتى تُطابق.', action: 'عرض', onClick: () => openWeek(current) },
        owing.length > 0 && { key: 'debts', tone: 'red', icon: 'currency', label: new Set(owing.map((debt) => debt.user_id)).size === 1 ? 'دين متبقٍّ على محصّل' : `ديون متبقية على ${new Set(owing.map((debt) => debt.user_id)).size} محصّلين`, hint: `المتبقي ${amountsLine(Object.fromEntries(Object.keys(currencies).map((currency) => [currency, owing.filter((debt) => debt.currency === currency).reduce((sum, debt) => sum + Number(debt.remaining), 0)])))}. تُسدَّد نقدًا من تبويب الإغلاقات.`, action: 'عرض', onClick: () => go('closings') },
    ].filter(Boolean);

    return (
        <AuthenticatedLayout
            header={<>
                <div>
                    <p className="text-sm font-semibold text-gray-500">{branches.length > 1 ? <select aria-label="الفرع" className="rounded-control border-gray-200 py-1 text-sm" value={branch.id} onChange={(event) => router.get(urls.index, { branch_id: event.target.value })}>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : branch.name}</p>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2"><h2 className="text-3xl font-bold text-gray-900">إدارة الإغلاق</h2>{started && <ClosingTabs tab={tab} onChange={go} waitingNotes={waitingNotes.length} />}</div>
                </div>
                {started && current && <div className="shrink-0"><PrimaryButton onClick={() => openWeek(current)}><Icon name="layers" className="h-4 w-4" />إغلاق {periodLabel(current)}</PrimaryButton></div>}
            </>}
        >
            <Head title="إدارة الإغلاق" />
            {errors?.action && <p role="alert" className="mb-5 rounded-control bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-400">{errors.action}</p>}
            {!started ? (
                <div className="rounded-panel border border-dashed border-gray-200 bg-surface px-5 py-12 text-center">
                    <p className="font-semibold text-gray-900">ابدأ الإغلاق الأسبوعي لهذا الفرع</p>
                    <p className="mt-1 text-sm text-gray-500">تُجمع الدفعات الجديدة في صناديق المحصّلين، ويُغلق الفرع كل أسبوع ويرسله إلى التدقيق.</p>
                    {access.manage && <PrimaryButton className="mt-5" onClick={() => setAction({ kind: 'start' })}>بدء الإغلاق الأسبوعي</PrimaryButton>}
                </div>
            ) : <>
                {tab === 'overview' && current && <div className="space-y-8">
                    <WeekHero current={current} payments={periodPayments} openBoxes={openBoxes} boxesUrl={boxesUrl} now={now} />
                    <WaitingTasks tasks={tasks} />
                </div>}
                {tab === 'closings' && (openedWeek
                    ? <WeekView week={openedWeek} notes={notes.filter((note) => note.closing_id === openedWeek.id)} adjustments={adjustments.filter((adjustment) => adjustment.original_closing_id === openedWeek.id)} closings={closings} access={access} urls={urls} branch={branch} onBack={() => go('closings')} onAction={(kind, record) => setAction({ kind, record })} />
                    : <WeeksTable weeks={weeks} filter={weekFilter} onFilter={setWeekFilter} onOpen={(id) => go('closings', id)} debts={owing} access={access} actorId={actorId} onAction={(kind, record) => setAction({ kind, record })} />)}
                {tab === 'settings' && <SettingsTab {...props} onAction={(kind, record = null) => setAction({ kind, record })} />}
            </>}
            {action && <ActionModal key={`${action.kind}-${action.record?.id}`} action={action} onClose={() => setAction(null)} props={props} />}
        </AuthenticatedLayout>
    );
}
