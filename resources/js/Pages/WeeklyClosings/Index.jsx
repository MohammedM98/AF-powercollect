import { useState } from 'react';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import ConfirmDialog from '@/Components/ConfirmDialog';
import Icon from '@/Components/Icon';
import Modal from '@/Components/Modal';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import StatusPill from '@/Components/DataTable/StatusPill';
import { useRowClick } from '@/hooks/useRowClick';
import { formatMoney, formatNumber } from '@/lib/format';
import { boxStatusLabels } from '@/lib/financialBoxes';
import { WEEKLY_STATUSES, weeklyProgress, weeklyStepStates } from '@/lib/weeklyClosings';
import { boxTypes, boxTypeStyles, BoxTypeIcon, currencies } from '../Payments/CollectorCashBox';
import { BoxPersonAvatar, financialAmountsLine } from '../Payments/FinancialBoxComponents';
import { dateTime, periodLabel, periodRange } from '../Closings/ClosingComponents';

const MONTH_NAME = new Intl.DateTimeFormat('ar-SY-u-nu-latn', { month: 'long', timeZone: 'UTC' });
const monthName = (month) => MONTH_NAME.format(new Date(Date.UTC(2026, month - 1, 1)));
const carriedLabels = { in: 'مرحّل من أسبوع سابق', out: 'لم يُغلق · يُرحّل للأسبوع القادم' };

function WeekStatus({ step }) {
    const [label, tone] = WEEKLY_STATUSES[step];
    return <StatusPill tone={tone} label={label} />;
}

function Amount({ amounts, large = false }) {
    const others = Object.keys(currencies).filter((currency) => currency !== 'ILS' && Number(amounts?.[currency] ?? 0) !== 0);
    return <span className="inline-flex flex-col">
        <span className="flex items-baseline gap-1.5"><b dir="ltr" className={`font-display text-gray-900 ${large ? 'text-2xl' : ''}`}>{formatMoney(amounts?.ILS ?? 0)}</b><span className="text-xs text-gray-500">شيكل</span></span>
        {others.length > 0 && <span className="font-display text-xs text-gray-500">{others.map((currency) => `${formatMoney(amounts[currency])} ${currencies[currency]}`).join(' · ')}</span>}
    </span>;
}

/** The week's progress bar: from closing the boxes to audit's answer. */
function WeekProgress({ step }) {
    const steps = weeklyStepStates(step);
    const progress = weeklyProgress(step);
    return <section aria-label="مراحل الإغلاق الأسبوعي" className="rounded-panel border border-gray-100 bg-surface p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-bold text-gray-900">مراحل الإغلاق</h3><span className="font-display text-sm text-gray-500">{progress}%</span></div>
        <div className="mb-5 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><div className="h-full rounded-full bg-brand-gradient transition-all" style={{ width: `${progress}%` }} /></div>
        <ol className="grid gap-3 sm:grid-cols-4">{steps.map((item, index) => <li key={item.key} aria-current={item.state === 'current' ? 'step' : undefined} className={`flex items-start gap-3 rounded-control border p-3 ${item.state === 'current' ? 'border-brand-500/40 bg-brand-500/5' : 'border-gray-100'}`}>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold ${item.state === 'done' ? 'bg-emerald-500 text-white' : item.state === 'current' ? 'bg-brand-gradient text-white' : 'bg-gray-100 text-gray-400'}`}>{item.state === 'done' ? <Icon name="check" className="h-4 w-4" /> : index + 1}</span>
            <span className="min-w-0"><b className={`block text-sm ${item.state === 'upcoming' ? 'text-gray-400' : 'text-gray-900'}`}>{item.label}</b><small className="block text-xs leading-5 text-gray-500">{item.hint}</small></span>
        </li>)}</ol>
    </section>;
}

function Notice({ tone = 'amber', items }) {
    if (!items?.length) return null;
    const colors = tone === 'red' ? 'border-brand-500/25 bg-brand-500/5 text-brand-600' : 'border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-400';
    return <ul className={`space-y-1 rounded-control border p-4 text-sm ${colors}`}>{items.map((item) => <li key={item} className="flex items-start gap-2"><Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />{item}</li>)}</ul>;
}

function Tile({ icon, label, children }) {
    return <div className="flex items-center gap-3 bg-surface px-5 py-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-gray-100 text-gray-600"><Icon name={icon} className="h-5 w-5" /></span><div className="min-w-0"><p className="text-xs font-semibold text-gray-500">{label}</p><div className="mt-0.5 text-xl font-bold text-gray-900">{children}</div></div></div>;
}

/** The whole week at a glance, then one confirmation that sends it to audit. */
function SubmitModal({ week, branchId, url, onClose }) {
    const form = useForm({ branch_id: branchId, notes: '', acknowledged: false });
    const totals = week.weekTotals;
    function submit(event) {
        event.preventDefault();
        form.post(`${url}/submit/${week.id}`, { preserveScroll: true, onSuccess: onClose });
    }
    return <Modal show onClose={onClose} maxWidth="3xl" centered><form onSubmit={submit} className="flex max-h-[90vh] flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-6 py-5"><div><h2 className="text-xl font-bold text-gray-900">تأكيد إغلاق {periodLabel(week)} وإرساله للتدقيق</h2><p className="mt-1 text-sm text-gray-500">{periodRange(week)} · {monthName(week.month)} <span className="font-display">{week.year}</span></p></div><button type="button" onClick={onClose} aria-label="إغلاق النافذة" className="rounded-control p-2 text-gray-500 hover:bg-gray-100"><Icon name="close" className="h-5 w-5" /></button></header>
        <div className="space-y-4 overflow-y-auto p-6">
            <div className="grid gap-px overflow-hidden rounded-control border border-gray-100 bg-gray-100 sm:grid-cols-3"><Tile icon="table" label="الصناديق المغلقة"><span className="font-display">{totals.closedBoxes} / {totals.boxes}</span></Tile><Tile icon="users" label="المحصّلون">{formatNumber(totals.collectors)}</Tile><Tile icon="wallet" label="إجمالي التحصيل"><Amount amounts={totals.amounts} /></Tile></div>
            <div className="data-table-container overflow-x-auto"><table className="data-table w-full text-start text-sm"><thead><tr><th>المحصّل</th><th>الصناديق المغلقة</th><th>الحركات</th><th>الإجمالي</th></tr></thead><tbody>{totals.byCollector.map((person) => <tr key={person.userId ?? 'none'}><td>{person.name}</td><td className="font-display">{person.closedBoxes} / {person.boxes}</td><td className="font-display">{person.entries}</td><td><Amount amounts={person.amounts} /></td></tr>)}</tbody></table></div>
            <Notice items={week.warnings} />
            <p className="rounded-control bg-sky-500/10 p-4 text-sm leading-7 text-sky-700 dark:text-sky-400">تتجمّد أرقام الأسبوع لحظة الإرسال ويصل الأسبوع لقسم التدقيق. أي تصحيح بعدها يُسجّل في الأسبوع المفتوح.</p>
            <label className="grid gap-2 text-sm font-semibold text-gray-700">ملاحظة للتدقيق (اختياري)<textarea rows="3" value={form.data.notes} onChange={(event) => form.setData('notes', event.target.value)} /></label>
            <label className="flex items-center gap-3 text-sm font-bold text-gray-900"><input type="checkbox" required checked={form.data.acknowledged} onChange={(event) => form.setData('acknowledged', event.target.checked)} />راجعت ملخص صناديق المحصّلين وأقرّ أن الأرقام صحيحة.</label>
            {Object.values(form.errors).length > 0 && <div role="alert" className="rounded-control bg-brand-500/10 p-4 text-sm text-brand-600">{Object.values(form.errors).map((error) => <p key={error}>{error}</p>)}</div>}
        </div>
        <footer className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4"><SecondaryButton onClick={onClose}>إلغاء</SecondaryButton><PrimaryButton type="submit" disabled={form.processing}><Icon name="send" className="h-4 w-4" />{form.processing ? 'جارٍ الإرسال…' : 'تأكيد وإرسال للتدقيق'}</PrimaryButton></footer>
    </form></Modal>;
}

function WeekDetails({ week, branchId, urls, onClose }) {
    const [submitting, setSubmitting] = useState(false);
    const [withdrawing, setWithdrawing] = useState(false);
    function withdraw() {
        router.post(`${urls.actions}/withdraw/${week.id}`, { branch_id: branchId }, { preserveScroll: true, onFinish: () => setWithdrawing(false) });
    }

    return <section aria-label={`تفاصيل ${periodLabel(week)}`} className="space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-panel border border-gray-100 bg-surface p-5 shadow-card">
            <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2"><h3 className="text-2xl font-bold text-gray-900">{periodLabel(week)}</h3><WeekStatus step={week.step} />{week.is_manual && <StatusPill tone="gray" label="إغلاق مبكر" />}</div>
                <p className="text-sm text-gray-500">{periodRange(week)} · {monthName(week.month)} <span className="font-display">{week.year}</span></p>
                {week.branchApprovedAt && <p className="text-xs text-gray-500">أكّده وأرسله {week.branchApprovedBy ?? '—'} · {dateTime(week.branchApprovedAt)}</p>}
                {week.branchNotes && <p className="text-xs text-gray-500">ملاحظة للتدقيق: {week.branchNotes}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {week.can.submit && <PrimaryButton disabled={week.blockers.length > 0} onClick={() => setSubmitting(true)}><Icon name="send" className="h-4 w-4" />تأكيد وإرسال للتدقيق</PrimaryButton>}
                {week.can.withdraw && <SecondaryButton onClick={() => setWithdrawing(true)}><Icon name="undo" className="h-4 w-4" />سحب من التدقيق</SecondaryButton>}
                <Link href={week.packageUrl} className="inline-flex items-center gap-1 px-2 text-sm font-semibold text-brand-600">الطرد والخزنة<Icon name="chevron-left" className="h-4 w-4" /></Link>
                <button type="button" onClick={onClose} aria-label="إغلاق التفاصيل" className="rounded-control p-2 text-gray-500 hover:bg-gray-100"><Icon name="close" className="h-5 w-5" /></button>
            </div>
        </header>
        <WeekProgress step={week.step} />
        {week.frozen && <p className="flex items-center gap-2 rounded-control border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600"><Icon name="lock" className="h-4 w-4" />الأرقام كما ثُبّتت لحظة التأكيد والإرسال.</p>}
        <Notice items={week.blockers} tone="red" />
        <Notice items={week.warnings} />

        <div className="grid gap-px overflow-hidden rounded-panel border border-gray-100 bg-gray-100 shadow-card sm:grid-cols-2 xl:grid-cols-4">
            <Tile icon="table" label="الصناديق المغلقة"><span className="font-display">{week.totals.closedBoxes} / {week.totals.boxes}</span></Tile>
            <Tile icon="users" label="المحصّلون">{formatNumber(week.totals.collectors)}</Tile>
            <Tile icon="list" label="الحركات السارية">{formatNumber(week.totals.entries)}</Tile>
            <Tile icon="wallet" label="إجمالي التحصيل"><Amount amounts={week.totals.amounts} /></Tile>
        </div>

        <section aria-label="حسب نوع الصندوق" className="grid gap-3 md:grid-cols-3">{week.totals.byType.map((row) => <article key={row.type} className="flex items-center gap-4 rounded-card border border-gray-100 bg-surface p-4 shadow-card">
            <BoxTypeIcon type={row.type} className="h-12 w-12" />
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-gray-700">{boxTypes[row.type]}</p><Amount amounts={row.amounts} large /><p className="text-xs text-gray-500"><b className="font-display">{row.boxes}</b> صناديق · <b className="font-display">{row.entries}</b> حركة</p></div>
        </article>)}</section>

        <section aria-label="المحصّلون" className="space-y-3">
            <h3 className="text-lg font-bold text-gray-900">المحصّلون وصناديقهم</h3>
            <div className="data-table-container overflow-x-auto"><table className="data-table w-full text-start text-sm">
                <thead><tr><th>المحصّل</th><th>الصناديق المغلقة</th>{Object.keys(boxTypes).map((type) => <th key={type}>{boxTypeStyles[type].label}</th>)}<th>الحركات</th><th>الإجمالي</th></tr></thead>
                <tbody>{week.totals.byCollector.map((person) => <tr key={person.userId ?? 'none'}>
                    <td data-label="المحصّل"><span className="flex items-center gap-2.5"><BoxPersonAvatar name={person.name} small /><span className="font-semibold text-gray-900">{person.name}</span></span></td>
                    <td data-label="الصناديق المغلقة" className="font-display">{person.closedBoxes} / {person.boxes}</td>
                    {Object.keys(boxTypes).map((type) => <td key={type} data-label={boxTypeStyles[type].label}>{person.types[type] ? <><Amount amounts={person.types[type].amounts} /><small className="block text-xs text-gray-400">{person.types[type].boxes} صندوق</small></> : <span className="text-gray-300">—</span>}</td>)}
                    <td data-label="الحركات" className="font-display">{person.entries}</td>
                    <td data-label="الإجمالي"><Amount amounts={person.amounts} /></td>
                </tr>)}</tbody>
            </table>{!week.totals.byCollector.length && <p className="py-10 text-center text-sm text-gray-500">لا صناديق بهذه الفلاتر.</p>}</div>
        </section>

        <section aria-label="الصناديق" className="space-y-3">
            <h3 className="text-lg font-bold text-gray-900">سجل الصناديق</h3>
            <div className="data-table-container overflow-x-auto"><table className="data-table w-full text-start text-sm">
                <thead><tr><th>الصندوق</th><th>المحصّل</th><th>النوع</th><th>فُتح ← أُغلق</th><th>الحركات</th><th>الإجمالي</th><th>الحالة</th></tr></thead>
                <tbody>{week.boxes.map((box) => <tr key={box.id}>
                    <td data-label="الصندوق"><Link href={box.url} className="flex items-center gap-2 font-semibold text-gray-900 hover:text-brand-600"><BoxTypeIcon type={box.type} className="h-8 w-8" />صندوق <bdi dir="ltr" className="font-display">{box.number}</bdi></Link></td>
                    <td data-label="المحصّل" className="text-gray-700">{box.userName ?? '—'}</td>
                    <td data-label="النوع">{boxTypeStyles[box.type].label}</td>
                    <td data-label="فُتح ← أُغلق" className="text-xs text-gray-600">{dateTime(box.openedAt)}<br />{box.closedAt ? dateTime(box.closedAt) : 'مفتوح'}</td>
                    <td data-label="الحركات"><b className="font-display">{box.entries}</b>{box.cancelled > 0 && <small className="block text-xs text-gray-400">{box.cancelled} ملغاة</small>}</td>
                    <td data-label="الإجمالي"><Amount amounts={box.amounts} /></td>
                    <td data-label="الحالة"><StatusPill tone={boxStatusLabels[box.status]?.[1] ?? 'gray'} label={boxStatusLabels[box.status]?.[0] ?? box.status} />{box.carried && <small className="mt-1 block text-xs text-amber-700 dark:text-amber-400">{carriedLabels[box.carried]}</small>}</td>
                </tr>)}</tbody>
            </table>{!week.boxes.length && <p className="py-10 text-center text-sm text-gray-500">لا صناديق بهذه الفلاتر.</p>}</div>
        </section>

        {week.events.length > 0 && <section aria-label="سجل الإغلاق" className="rounded-panel border border-gray-100 bg-surface p-5 shadow-card">
            <h3 className="mb-3 font-bold text-gray-900">سجل الإغلاق</h3>
            <ul className="space-y-2 text-sm">{week.events.map((event) => <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2"><span className="text-gray-700">{event.description}{event.user && <span className="text-gray-500"> · {event.user}</span>}</span><small className="text-xs text-gray-500">{dateTime(event.at)}</small></li>)}</ul>
        </section>}

        {submitting && <SubmitModal week={week} branchId={branchId} url={urls.actions} onClose={() => setSubmitting(false)} />}
        <ConfirmDialog show={withdrawing} onCancel={() => setWithdrawing(false)} onConfirm={withdraw} title="سحب الأسبوع من التدقيق" message="يعود الأسبوع للمراجعة قبل أن يفتحه قسم التدقيق. تبقى النسخة المرسلة في السجل، والإرسال التالي ينشئ نسخة جديدة." confirmLabel="سحب" icon="undo" tone="danger" />
    </section>;
}

/**
 * The branch's weekly closings: each week's boxes summed by type and by
 * collector, filtered by year, month, step, box type and collector, and the
 * week picked in full with its progress from closing the boxes to audit's
 * answer, confirmed and sent to audit in one step.
 */
export default function WeeklyClosingsIndex({ branch, branches, started, weeks, selected, filters, years, people, urls }) {
    const { errors } = usePage().props;
    const rowClick = useRowClick();
    function filter(changes) {
        const query = { branch_id: branch.id, ...filters, closing_id: selected?.id, ...changes };
        router.get(urls.index, Object.fromEntries(Object.entries(query).filter(([, value]) => value !== null && value !== '' && value !== undefined)), { preserveScroll: true, preserveState: true, replace: true });
    }
    const totals = weeks.reduce((sum, week) => ({ boxes: sum.boxes + week.totals.boxes, entries: sum.entries + week.totals.entries, amounts: Object.fromEntries(Object.keys(currencies).map((currency) => [currency, Number(sum.amounts[currency] ?? 0) + Number(week.totals.amounts[currency] ?? 0)])) }), { boxes: 0, entries: 0, amounts: {} });

    return <AuthenticatedLayout header={<div><p className="text-sm font-semibold text-gray-500">{branches.length > 1 ? <select aria-label="الفرع" className="rounded-control border-gray-200 py-1 text-sm" value={branch.id} onChange={(event) => router.get(urls.index, { branch_id: event.target.value })}>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : branch.name}</p><h2 className="mt-1 text-3xl font-bold text-gray-900">الإغلاق الأسبوعي</h2><p className="mt-1 text-sm text-gray-500">راجع ملخص كل صناديق المحصّلين في الأسبوع، ثم أكّده وأرسله لقسم التدقيق بزر واحد.</p></div>}>
        <Head title="الإغلاق الأسبوعي" />
        {!started ? <p className="rounded-panel border border-dashed border-gray-200 bg-surface p-6 text-sm leading-7 text-gray-500">لم يُفعّل نظام الصناديق في هذا الفرع بعد. يُفعّله مسؤول الفرع من صفحة الخزنة والكشوفات.</p> : <div className="space-y-6">
            {errors?.action && <p role="alert" className="rounded-control bg-brand-500/10 p-4 text-sm text-brand-600">{errors.action}</p>}

            <section aria-label="الفلاتر" className="flex flex-wrap items-end gap-3 rounded-panel border border-gray-100 bg-surface p-4 shadow-card">
                <label className="grid gap-1 text-xs font-semibold text-gray-500">السنة<select value={filters.year} onChange={(event) => filter({ year: event.target.value, closing_id: null })} className="py-2 text-sm">{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
                <label className="grid gap-1 text-xs font-semibold text-gray-500">الشهر<select value={filters.month ?? ''} onChange={(event) => filter({ month: event.target.value, closing_id: null })} className="py-2 text-sm"><option value="">كل الأشهر</option>{Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{monthName(month)}</option>)}</select></label>
                <label className="grid gap-1 text-xs font-semibold text-gray-500">المرحلة<select value={filters.step} onChange={(event) => filter({ step: event.target.value })} className="py-2 text-sm"><option value="">كل المراحل</option>{Object.entries(WEEKLY_STATUSES).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label className="grid gap-1 text-xs font-semibold text-gray-500">نوع الصندوق<select value={filters.type} onChange={(event) => filter({ type: event.target.value })} className="py-2 text-sm"><option value="">كل الأنواع</option>{Object.entries(boxTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label className="grid gap-1 text-xs font-semibold text-gray-500">المحصّل<select value={filters.user_id ?? ''} onChange={(event) => filter({ user_id: event.target.value })} className="py-2 text-sm"><option value="">كل المحصّلين</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                {(filters.month || filters.step || filters.type || filters.user_id) && <button type="button" onClick={() => filter({ month: null, step: '', type: '', user_id: null })} className="pb-2 text-sm font-semibold text-brand-600">مسح الفلاتر</button>}
            </section>

            {selected && <WeekDetails key={selected.id} week={selected} branchId={branch.id} urls={urls} onClose={() => filter({ closing_id: null })} />}

            <section aria-label="الأسابيع" className="space-y-3">
                <h3 className="text-lg font-bold text-gray-900">أسابيع {filters.month ? `${monthName(filters.month)} ` : ''}<span className="font-display">{filters.year}</span></h3>
                <div className="data-table-container overflow-x-auto"><table className="data-table w-full text-start text-sm">
                    <thead><tr><th>الأسبوع</th><th>الشهر</th><th>الصناديق المغلقة</th><th>المحصّلون</th><th>الحركات</th><th>الإجمالي</th><th>المرحلة</th></tr></thead>
                    <tbody>{weeks.map((week) => <tr key={week.id} {...rowClick(() => filter({ closing_id: week.id }))} aria-selected={week.id === selected?.id} className={week.id === selected?.id ? 'bg-brand-500/5' : ''}>
                        <td data-label="الأسبوع"><b className="text-gray-900">{periodLabel(week)}</b><small className="block text-xs text-gray-500">{periodRange(week)}</small></td>
                        <td data-label="الشهر">{monthName(week.month)} <span className="font-display">{week.year}</span></td>
                        <td data-label="الصناديق المغلقة" className="font-display">{week.totals.closedBoxes} / {week.totals.boxes}</td>
                        <td data-label="المحصّلون" className="font-display">{week.totals.collectors}</td>
                        <td data-label="الحركات" className="font-display">{week.totals.entries}</td>
                        <td data-label="الإجمالي"><Amount amounts={week.totals.amounts} /></td>
                        <td data-label="المرحلة"><WeekStatus step={week.step} /></td>
                    </tr>)}</tbody>
                </table>{!weeks.length && <div className="flex flex-col items-center gap-2 px-4 py-14 text-center text-gray-500"><Icon name="calendar" className="h-8 w-8 text-gray-400" /><p>لا أسابيع بهذه الفلاتر.</p></div>}</div>
                {weeks.length > 0 && <p className="data-table-totals text-sm text-gray-600"><span><b className="font-display text-gray-900">{weeks.length}</b> أسابيع</span><span><b className="font-display text-gray-900">{totals.boxes}</b> صندوقًا · <b className="font-display text-gray-900">{totals.entries}</b> حركة</span><span>المجموع: <b className="font-display text-gray-900">{financialAmountsLine(totals.amounts)}</b></span></p>}
            </section>
        </div>}
    </AuthenticatedLayout>;
}
