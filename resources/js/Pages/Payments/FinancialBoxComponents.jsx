import Icon from '@/Components/Icon';
import PrimaryButton from '@/Components/PrimaryButton';
import SecondaryButton from '@/Components/SecondaryButton';
import StatusPill from '@/Components/DataTable/StatusPill';
import { formatMoney } from '@/lib/format';
import { activeBoxEntries, boxPersonName, financialBoxChecks, financialBoxTotals, financialBoxesTotals } from '@/lib/financialBoxes';
import { boxTypes, boxTypeStyles, currencies, BoxTypeIcon } from './CollectorCashBox';
import './financial-boxes.css';

const statuses = { open: ['مفتوح', 'blue'], pending: ['بانتظار تأكيد الإغلاق', 'amber'], received: ['أُكّد إغلاقه', 'green'] };
const dots = { open: 'bg-emerald-500', pending: 'bg-amber-500', received: 'bg-gray-400' };
const date = (value) => value ? new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'short', timeZone: 'Asia/Gaza' }).format(new Date(value)) : '—';

export function financialAmountsLine(amounts) {
    return Object.keys(currencies).filter((currency) => currency === 'ILS' || amounts[currency]).map((currency) => `${formatMoney(amounts[currency])} ${currencies[currency]}`).join(' · ');
}

function foreignAmounts(amounts) {
    return Object.keys(currencies).filter((currency) => currency !== 'ILS' && amounts[currency]).map((currency) => `${formatMoney(amounts[currency])} ${currencies[currency]}`).join(' · ');
}

export function BoxPersonAvatar({ name, small = false }) {
    return <span aria-hidden="true" className={`flex shrink-0 items-center justify-center bg-gray-900 font-semibold text-surface ${small ? 'h-7 w-7 rounded-[9px] text-[11px]' : 'h-8 w-8 rounded-[10px] text-xs'}`}>{name ? name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('') : <Icon name="bank" className="h-4 w-4" />}</span>;
}

export function FinancialBoxIdentity({ box, period, card = false }) {
    return <div className="flex min-w-0 items-center gap-3">
        <span className="relative shrink-0"><BoxTypeIcon type={box.type} className={card ? 'h-11 w-11' : 'h-10 w-10'} /><span className={`absolute -bottom-0.5 -start-0.5 h-3 w-3 rounded-full border-[2.5px] border-surface ${dots[box.status]}`} /></span>
        <span className="min-w-0"><span className="block truncate font-semibold text-gray-900">صندوق <bdi dir="ltr" className="font-display">{box.number}</bdi></span><span className="block truncate text-xs text-gray-400">{boxTypeStyles[box.type].label}{period && period !== '—' ? ` · ${period}` : ''}</span></span>
    </div>;
}

export function FinancialBoxStatus({ box, compact = false }) {
    const [label, tone] = statuses[box.status];
    return <><StatusPill tone={tone} label={compact && box.status === 'pending' ? 'بانتظار الإغلاق' : label} />{box.status === 'received' && !box.confirmed_at && <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">ينتظر تأكيد المحصّل</span>}</>;
}

export function FinancialBoxAmount({ box, large = false }) {
    const totals = financialBoxTotals(box);
    const others = foreignAmounts(totals);
    return <><p className="flex flex-wrap items-baseline gap-x-1.5"><b dir="ltr" className={`font-display text-gray-900 ${large ? 'text-[1.75rem] leading-tight' : 'text-[1.0625rem]'}`}>{formatMoney(totals.ILS)}</b><span className={`${large ? 'text-sm' : 'text-xs'} text-gray-500`}>شيكل</span></p><p className={`${large ? 'min-h-[1.4rem]' : ''} font-display text-xs text-gray-500`}>{others ? `و${others}` : ''}</p></>;
}

function CheckTrack({ parts, small = false }) {
    return <span className={`financial-box-track ${small ? '!h-1.5 w-16 shrink-0' : 'w-full'}`} role="img" aria-label={parts.map((part) => `${part.label} ${part.count}`).join('، ')}>{parts.filter((part) => part.count).map((part) => <span key={part.label} className={part.color} style={{ flex: part.count }} />)}</span>;
}

export function FinancialBoxEntries({ box, card = false }) {
    const entries = activeBoxEntries(box);
    const count = box.paymentCount ?? entries.length;
    const cancelled = box.payments ? box.payments.length - entries.length : 0;
    if (box.type === 'cash') {
        const foreign = entries.filter((entry) => entry.currency !== 'ILS').length;
        return <>{!card && <p><b className="font-display text-gray-900">{count}</b> <span className="text-xs text-gray-500">حركة{cancelled > 0 ? ` · ${cancelled} ملغاة` : ''}</span></p>}<p className="mt-1 flex items-center gap-2 text-xs text-gray-500"><Icon name="banknotes" className="h-4 w-4" />{card ? (box.status === 'pending' ? 'يُعدّ النقد عند تأكيد الإغلاق' : box.status === 'open' ? 'يجمع المحصّل النقد' : 'عُدّ النقد وطابق الإجمالي') : foreign ? `${foreign} بعملة أجنبية` : 'نقد بالشيكل'}</p></>;
    }
    if (!box.payments) {
        return <p className="text-xs text-gray-500"><b className="font-display text-gray-900">{count}</b> حركة{box.rejectedCount ? ` · ${box.rejectedCount} مرفوضة` : ''}</p>;
    }
    const parts = financialBoxChecks(box);
    return card ? <div><CheckTrack parts={parts} /><p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-gray-500">{parts.filter((part) => part.count).map((part) => <span key={part.label} className="inline-flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${part.color}`} />{part.label} <b className="font-display text-gray-700">{part.count}</b></span>)}</p></div> : <><p><b className="font-display text-gray-900">{count}</b> <span className="text-xs text-gray-500">حركة{cancelled ? ` · ${cancelled} ملغاة` : ''}</span></p><span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5"><CheckTrack parts={parts} small /><span className="text-xs text-gray-500"><b className="font-display text-gray-700">{parts[0].count}/{count}</b> {parts[0].label}{parts[2].count > 0 && <b className="font-semibold text-brand-600"> · {parts[2].count} {parts[2].label}</b>}</span></span></>;
}

export function FinancialBoxDates({ box }) {
    return <span className="text-xs text-gray-600">{date(box.opened_at)} ← {box.closed_at ? date(box.closed_at) : <span className="text-gray-400">مفتوح</span>}</span>;
}

export function FinancialBoxButton({ box, onOpen, className = '' }) {
    const canClose = !box.frozen && box.canCount && box.kind !== 'direct' && ['open', 'pending'].includes(box.status);
    return canClose ? <PrimaryButton type="button" onClick={() => onOpen(box)} className={`whitespace-nowrap px-3 py-1.5 ${className}`}><Icon name="check" className="h-4 w-4" />مراجعة وإغلاق</PrimaryButton> : <SecondaryButton type="button" onClick={() => onOpen(box)} className={`whitespace-nowrap px-3 py-1.5 ${className}`}>عرض الصندوق</SecondaryButton>;
}

export function FinancialBoxCard({ box, period, onOpen }) {
    const count = box.paymentCount ?? activeBoxEntries(box).length;
    return <article className="financial-box-card flex flex-col gap-4 rounded-card border border-gray-100 bg-surface p-5 shadow-card" data-status={box.status}>
        <header><FinancialBoxIdentity box={box} period={period} card /></header>
        <div className="flex items-center gap-2.5 rounded-control bg-gray-50 px-3 py-2"><BoxPersonAvatar name={box.user?.name} /><span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-700">{boxPersonName(box)}</span><span className="shrink-0 text-xs text-gray-500"><b className="font-display text-gray-900">{count}</b> حركة</span></div>
        <div><p className="text-xs font-semibold text-gray-500">إجمالي الحركات السارية</p><div className="mt-0.5"><FinancialBoxAmount box={box} large /></div></div>
        <FinancialBoxEntries box={box} card />
        <footer className="mt-auto space-y-3 border-t border-gray-100 pt-3"><div className="flex flex-wrap items-center justify-between gap-2"><FinancialBoxStatus box={box} compact /><span className="inline-flex items-center gap-1.5"><Icon name="clock" className="h-3.5 w-3.5 text-gray-500" /><FinancialBoxDates box={box} /></span></div><FinancialBoxButton box={box} onOpen={onOpen} className="w-full" /></footer>
    </article>;
}

export function FinancialBoxSummary({ boxes, pageOnly = false }) {
    const pending = boxes.filter((box) => box.status === 'pending');
    const cells = [{ icon: <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-amber-500/10 text-amber-600 dark:text-amber-400"><Icon name="clock" className="h-5 w-5" /></span>, label: 'بانتظار تأكيد الإغلاق', boxes: pending }, ...Object.keys(boxTypes).map((type) => ({ icon: <BoxTypeIcon type={type} className="h-10 w-10" />, label: boxTypes[type], boxes: boxes.filter((box) => box.type === type && box.status !== 'received'), unconfirmed: true }))];
    return <section aria-label="ملخص الصناديق"><div className="grid gap-px overflow-hidden rounded-panel border border-gray-100 bg-gray-100 shadow-card sm:grid-cols-2 xl:grid-cols-4">{cells.map((cell) => <div key={cell.label} className="flex items-center gap-3 bg-surface px-5 py-4">{cell.icon}<div className="min-w-0"><p className="text-xs font-semibold text-gray-500">{cell.label}</p><p className="mt-0.5 flex items-baseline gap-1.5"><span dir="ltr" className="font-display text-xl font-bold text-gray-900">{formatMoney(financialBoxesTotals(cell.boxes).ILS)}</span><span className="text-xs text-gray-500">₪</span></p><p className="truncate text-xs text-gray-400">{cell.boxes.length} صناديق{cell.unconfirmed ? ' غير مؤكدة' : ''}{pageOnly ? ' في هذه الصفحة' : ''}</p></div></div>)}</div></section>;
}
