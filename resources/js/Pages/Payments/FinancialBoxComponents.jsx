import Icon from '@/Components/Icon';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import StatusPill from '@/Components/DataTable/StatusPill';
import { formatMoney } from '@/lib/format';
import { activeBoxEntries, boxPersonName, boxStatus, financialBoxTotals, financialBoxesTotals, isFlaggedEntry } from '@/lib/financialBoxes';
import { boxTypes, boxTypeStyles, currencies, BoxTypeIcon } from './CollectorCashBox';
import './financial-boxes.css';

const dots = { open: 'bg-emerald-500', pending: 'bg-amber-500', received: 'bg-amber-500', sent: 'bg-gray-400' };
const dotOf = (box) => dots[box.sent_at ? 'sent' : box.status];
const date = (value) => value ? new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'short', timeZone: 'Asia/Gaza' }).format(new Date(value)) : '—';
const dateTimeShort = (value) => value ? new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Gaza' }).format(new Date(value)) : '—';

export function financialAmountsLine(amounts) {
    return Object.keys(currencies).filter((currency) => currency === 'ILS' || Number(amounts?.[currency] ?? 0) !== 0).map((currency) => `${formatMoney(amounts?.[currency] ?? 0)} ${currencies[currency]}`).join(' · ');
}

function foreignAmounts(amounts) {
    return Object.keys(currencies).filter((currency) => currency !== 'ILS' && amounts[currency]).map((currency) => `${formatMoney(amounts[currency])} ${currencies[currency]}`).join(' · ');
}

export function BoxPersonAvatar({ name, small = false }) {
    return <span aria-hidden="true" className={`flex shrink-0 items-center justify-center bg-gray-900 font-semibold text-surface ${small ? 'h-7 w-7 rounded-[9px] text-[11px]' : 'h-8 w-8 rounded-[10px] text-xs'}`}>{name ? name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('') : <Icon name="bank" className="h-4 w-4" />}</span>;
}

export function FinancialBoxIdentity({ box, period, card = false }) {
    return <div className="flex min-w-0 items-center gap-3">
        <span className="relative shrink-0"><BoxTypeIcon type={box.type} className={card ? 'h-11 w-11' : 'h-10 w-10'} /><span className={`absolute -bottom-0.5 -start-0.5 h-3 w-3 rounded-full border-[2.5px] border-surface ${dotOf(box)}`} /></span>
        <span className="min-w-0"><span className="block truncate font-semibold text-gray-900">صندوق <bdi dir="ltr" className="font-display">{box.number}</bdi></span><span className="block truncate text-xs text-gray-400">{boxTypeStyles[box.type].label}{period && period !== '—' ? ` · ${period}` : ''}</span></span>
    </div>;
}

/** A box's type, its icon carrying the box's state as a dot: نقدي, حوالات بنكية or مقاصة. */
export function FinancialBoxType({ box }) {
    return <>
        <span className="relative shrink-0"><BoxTypeIcon type={box.type} className="h-10 w-10" /><span className={`absolute -bottom-0.5 -start-0.5 h-3 w-3 rounded-full border-[2.5px] border-surface ${dotOf(box)}`} /></span>
        <span className="text-[15px] font-semibold text-gray-900">{boxTypeStyles[box.type].label}</span>
    </>;
}

export function FinancialBoxStatus({ box }) {
    const [label, tone] = boxStatus(box);
    return <><StatusPill tone={tone} label={label} />{Number(box.branch_debt ?? 0) > 0 && <span className="mt-1 block text-xs font-semibold text-brand-600">دين على الفرع {formatMoney(box.branch_debt)} شيكل</span>}</>;
}

export function FinancialBoxAmount({ box, large = false }) {
    const totals = financialBoxTotals(box);
    const others = foreignAmounts(totals);
    return <><p className="flex flex-wrap items-baseline gap-x-1.5"><b dir="ltr" className={`font-display text-gray-900 ${large ? 'text-[1.75rem] leading-tight' : 'text-[1.0625rem]'}`}>{formatMoney(totals.ILS)}</b><span className={`${large ? 'text-sm' : 'text-[13px]'} text-gray-600`}>شيكل</span></p><p className={`${large ? 'min-h-[1.4rem]' : ''} font-display text-[13px] text-gray-600`}>{others ? `و${others}` : ''}</p></>;
}

export function FinancialBoxEntries({ box, card = false }) {
    const entries = activeBoxEntries(box);
    const count = box.paymentCount ?? entries.length;
    const cancelled = box.payments ? box.payments.length - entries.length : 0;
    if (box.type === 'cash') {
        const foreign = entries.filter((entry) => entry.currency !== 'ILS').length;
        return <>{!card && <p><b className="font-display text-gray-900">{count}</b> <span className="text-[13px] text-gray-600">حركة{cancelled > 0 ? ` · ${cancelled} ملغاة` : ''}</span></p>}<p className="mt-1 flex items-center gap-2 text-[13px] text-gray-600"><Icon name="banknotes" className="h-4 w-4" />{card ? (box.status === 'pending' ? 'يُعدّ النقد عند تأكيد الإغلاق' : box.status === 'open' ? 'يجمع المحصّل النقد' : 'عُدّ النقد وطابق الإجمالي') : foreign ? `${foreign} بعملة أجنبية` : 'نقد بالشيكل'}</p></>;
    }
    if (!box.payments) {
        return <p className="text-[13px] text-gray-600"><b className="font-display text-gray-900">{count}</b> حركة{box.rejectedCount ? ` · ${box.rejectedCount} مرفوضة` : ''}</p>;
    }
    const flagged = entries.filter(isFlaggedEntry).length;
    const note = <p className="mt-1 flex items-center gap-2 text-[13px] text-gray-600"><Icon name={box.type === 'clearing' ? 'scale' : 'bank'} className="h-4 w-4" />{flagged ? <b className="font-semibold text-brand-600">{flagged} {box.type === 'clearing' ? 'مرفوضة' : 'غير موجودة في البنك'}</b> : 'يدقّقها قسم التدقيق بعد الإغلاق'}</p>;
    return card ? note : <><p><b className="font-display text-gray-900">{count}</b> <span className="text-[13px] text-gray-600">حركة{cancelled ? ` · ${cancelled} ملغاة` : ''}</span></p>{note}</>;
}

export function FinancialBoxDates({ box }) {
    return <span className="text-sm text-gray-800">{date(box.opened_at)} ← {box.closed_at ? date(box.closed_at) : <span className="text-gray-600">مفتوح</span>}</span>;
}

/** One moment in a box's life, with who did it: opened, closed or sent. */
function TimesLine({ icon, tone, label, at, by }) {
    return <li className="flex items-start gap-1.5 leading-5"><Icon name={icon} className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} /><span className="min-w-0"><span className="text-gray-500">{label}</span> <b className="whitespace-nowrap font-semibold text-gray-800">{dateTimeShort(at)}</b>{by && <span className="block text-xs text-gray-500">{by}</span>}</span></li>;
}

/** When the box was opened, when it was closed and by whom, and when it was sent to audit and by whom. */
export function FinancialBoxTimes({ box }) {
    const closed = box.status === 'received';

    return <ul className="space-y-1 text-[13px]">
        <TimesLine icon="clock" tone="text-emerald-600 dark:text-emerald-400" label="فُتح" at={box.opened_at} />
        {closed ? <TimesLine icon="lock" tone="text-amber-600 dark:text-amber-400" label="أُغلق" at={box.closedAt ?? box.closed_at} by={box.closedBy} /> : <li className="flex items-center gap-1.5 text-gray-500"><Icon name="lock" className="h-3.5 w-3.5" />{box.status === 'pending' ? 'ينتظر تأكيد الإغلاق' : 'لم يُغلق بعد'}</li>}
        {box.sent_at ? <TimesLine icon="send" tone="text-sky-600 dark:text-sky-400" label="أُرسل" at={box.sent_at} by={box.sentBy} /> : closed && <li className="flex items-center gap-1.5 text-gray-500"><Icon name="send" className="h-3.5 w-3.5" />لم يُرسل بعد</li>}
    </ul>;
}

/**
 * Whether the actor may review and close the box now: theirs to close,
 * still open or waiting, and holding entries (an empty box cannot be
 * closed).
 */
export function canCloseBox(box) {
    return !box.frozen && box.canCount && ['open', 'pending'].includes(box.status) && (box.payments?.length ?? box.paymentCount ?? 0) > 0;
}

/** Whether the actor may send the box to audit now: the branch confirmed it closed and has not sent it. */
export const canSendBox = (box) => Boolean(box.canSend) && box.status === 'received' && !box.sent_at;

/** Whether the audit sent the box back with a note the actor may answer. */
export const canAnswerBox = (box) => Boolean(box.canSend) && box.audit_status === 'returned';

/**
 * The box's main action in its row: review and close it while it is open,
 * send it once closed, answer the audit when it sent it back, else open it.
 */
export function FinancialBoxButton({ box, onOpen, onSend, className = '' }) {
    if (canCloseBox(box)) {
        return <PrimaryButton type="button" onClick={() => onOpen(box)} className={`whitespace-nowrap px-3 py-1.5 ${className}`}><Icon name="check" className="h-4 w-4" />مراجعة وإغلاق</PrimaryButton>;
    }
    if (onSend && canSendBox(box)) {
        return <PrimaryButton type="button" onClick={() => onSend([box])} className={`whitespace-nowrap px-3 py-1.5 ${className}`}><Icon name="send" className="h-4 w-4" />إرسال</PrimaryButton>;
    }
    if (canAnswerBox(box)) {
        return <SecondaryButton type="button" onClick={() => onOpen(box)} className={`whitespace-nowrap px-3 py-1.5 text-brand-600 ${className}`}><Icon name="chat" className="h-4 w-4" />الرد على التدقيق</SecondaryButton>;
    }

    return <SecondaryButton type="button" onClick={() => onOpen(box)} className={`whitespace-nowrap px-3 py-1.5 ${className}`}>عرض الصندوق</SecondaryButton>;
}

export function FinancialBoxCard({ box, period, onOpen, onSend, selection }) {
    const count = box.paymentCount ?? activeBoxEntries(box).length;
    const picked = selection?.picked.has(box.id);
    return <article className={`financial-box-card flex flex-col gap-4 rounded-card border bg-surface p-5 shadow-card ${picked ? 'border-brand-500/40' : 'border-gray-100'}`} data-status={box.status}>
        <header className="flex items-start justify-between gap-3"><FinancialBoxIdentity box={box} period={period} card />{selection && <input type="checkbox" checked={picked} onChange={() => selection.toggle(box.id)} aria-label={`تحديد الصندوق ${box.number}`} className="mt-1 h-[18px] w-[18px] rounded border-gray-300 text-brand-600 focus:ring-brand-500" />}</header>
        <div className="flex items-center gap-2.5 rounded-control bg-gray-50 px-3 py-2"><span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-gray-900">{boxPersonName(box)}</span><span className="shrink-0 text-[13px] text-gray-600"><b className="font-display text-gray-900">{count}</b> حركة</span></div>
        <div><p className="text-xs font-semibold text-gray-500">إجمالي الحركات السارية</p><div className="mt-0.5"><FinancialBoxAmount box={box} large /></div></div>
        <FinancialBoxEntries box={box} card />
        <footer className="mt-auto space-y-3 border-t border-gray-100 pt-3"><div className="flex flex-wrap items-start justify-between gap-2"><FinancialBoxStatus box={box} />{box.canSend === undefined ? <span className="inline-flex items-center gap-1.5"><Icon name="clock" className="h-3.5 w-3.5 text-gray-500" /><FinancialBoxDates box={box} /></span> : <FinancialBoxTimes box={box} />}</div><FinancialBoxButton box={box} onOpen={onOpen} onSend={onSend} className="w-full" /></footer>
    </article>;
}

export function FinancialBoxSummary({ boxes, pageOnly = false }) {
    const pending = boxes.filter((box) => box.status === 'pending');
    const cells = [{ icon: <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-amber-500/10 text-amber-600 dark:text-amber-400"><Icon name="clock" className="h-5 w-5" /></span>, label: 'بانتظار تأكيد الإغلاق', boxes: pending }, ...Object.keys(boxTypes).map((type) => ({ icon: <BoxTypeIcon type={type} className="h-10 w-10" />, label: boxTypes[type], boxes: boxes.filter((box) => box.type === type && box.status !== 'received'), unconfirmed: true }))];
    return <section aria-label="ملخص الصناديق" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cells.map((cell) => <article key={cell.label} className="flex min-w-0 items-center gap-3 rounded-card border border-gray-100 bg-surface p-4 shadow-card">{cell.icon}<div className="min-w-0"><p className="text-sm font-semibold text-gray-600">{cell.label}</p><p className="mt-0.5 flex flex-wrap items-baseline gap-1.5"><span dir="ltr" className="font-display text-xl font-bold text-gray-900">{formatMoney(financialBoxesTotals(cell.boxes).ILS)}</span><span className="text-xs text-gray-500">₪</span></p><p className="text-xs text-gray-500">{cell.boxes.length} صناديق{cell.unconfirmed ? ' لم تُغلق بعد' : ''}{pageOnly ? ' في هذه الصفحة' : ''}</p></div></article>)}</section>;
}
