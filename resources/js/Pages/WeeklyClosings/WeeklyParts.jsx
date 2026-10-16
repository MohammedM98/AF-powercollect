import Icon from '@/Components/Icon';
import { formatMoney } from '@/lib/format';
import { BankMark } from '../Subscriptions/PaymentModal';
import { branchClock, branchDate } from '@/lib/closingPeriods';
import { currencies } from '../Payments/CollectorCashBox';

/** Each box type's colour as a bar or a dot, beside the tile colours of `boxTypeStyles`. */
export const typeBars = { cash: 'bg-emerald-500', bank_transfer: 'bg-sky-500', clearing: 'bg-violet-500' };

export const amountOf = (amounts, currency = 'ILS') => Number(amounts?.[currency] ?? 0);

/** Amounts added up by currency. */
export function addAmounts(list) {
    return Object.fromEntries(Object.keys(currencies).map((currency) => [currency, list.reduce((sum, amounts) => sum + amountOf(amounts, currency), 0)]));
}

/** The foreign currencies among amounts, as one quiet line, or an empty string. */
export function foreignLine(amounts) {
    return Object.keys(currencies).filter((currency) => currency !== 'ILS' && amountOf(amounts, currency)).map((currency) => `${formatMoney(amounts[currency])} ${currencies[currency]}`).join(' · ');
}

/** An amount in shekels with a quiet sign. */
export function Shekels({ value, className = '' }) {
    return <bdi dir="ltr" className={`whitespace-nowrap font-display ${className}`}>{formatMoney(value)}<span className="ms-1 text-[0.8em] font-medium opacity-55">₪</span></bdi>;
}

/** A headline amount in shekels: the whole shekels stand out, the agorot fade. */
export function BigShekels({ value, className = '' }) {
    const [whole, cents] = formatMoney(value).split('.');

    return <bdi dir="ltr" className={`whitespace-nowrap font-display ${className}`}>{whole}{cents !== undefined && <span className="opacity-35">.{cents}</span>}<span className="ms-1.5 text-[0.6em] font-semibold opacity-50">₪</span></bdi>;
}

/** Arabic counts: one, two, three to ten, and eleven and up each take their own form. */
function counted(count, one, two, few, many) {
    if (count === 1) return one;
    if (count === 2) return two;

    return <><b className="font-display">{count}</b> {count >= 3 && count <= 10 ? few : many}</>;
}

export const boxesWord = (count) => counted(count, 'صندوق واحد', 'صندوقان', 'صناديق', 'صندوقًا');
export const entriesWord = (count) => counted(count, 'حركة واحدة', 'حركتان', 'حركات', 'حركة');
export const collectorsWord = (count) => counted(count, 'محصّل واحد', 'محصّلان', 'محصّلين', 'محصّلًا');

/** When something happened, as the branch's day and clock: "5 تشرين الأول · 16:45". */
export const branchMoment = (value) => value ? `${branchDate(value)} · ${branchClock(value)}` : '—';

export const activeEntries = (box) => (box.payments ?? []).filter((entry) => entry.transactionStatus === 'active');

/** Transfers grouped by the bank they arrived at, the largest shekel total first. */
export function byReceivingBank(entries) {
    const groups = new Map();
    entries.forEach((entry) => {
        const bank = entry.bankName || 'بنك غير مسجّل';
        groups.set(bank, [...(groups.get(bank) ?? []), entry]);
    });

    return [...groups].map(([bank, items]) => {
        const active = items.filter((entry) => entry.transactionStatus === 'active');

        return { bank, entries: items, totals: addAmounts(active.map((entry) => ({ [entry.currency]: entry.amount }))) };
    }).sort((a, b) => b.totals.ILS - a.totals.ILS);
}

/** A few bank logos overlapping, then how many more there are. */
export function BankStack({ banks, max = 4 }) {
    return <span className="inline-flex items-center" title={banks.join('، ')}>
        {banks.slice(0, max).map((bank, index) => <span key={bank} className={`rounded-md ring-2 ring-surface ${index ? '-ms-1.5' : ''}`}><BankMark bank={bank} className="block h-5 w-5 rounded-md" /></span>)}
        {banks.length > max && <span className="-ms-1.5 flex h-5 min-w-5 items-center justify-center rounded-md bg-gray-100 px-1 font-display text-[11px] font-semibold text-gray-600 ring-2 ring-surface">+{banks.length - max}</span>}
    </span>;
}

/** Whether the branch went through a box yet, as a pill. */
export function ReviewPill({ reviewed }) {
    return reviewed
        ? <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400"><Icon name="check" className="h-3.5 w-3.5" />تمت مراجعته</span>
        : <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500"><span className="h-1.5 w-1.5 rounded-full bg-gray-400" />لم يُراجع</span>;
}

/** How many of a group's boxes were reviewed, as a short bar and a count. */
export function ReviewMeter({ done, total }) {
    return <span className="flex items-center gap-2">
        <span className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-100"><span className={`block h-full rounded-full ${done === total ? 'bg-emerald-500' : 'bg-gray-900'}`} style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} /></span>
        <span className="font-display text-xs text-gray-500">{done}/{total}</span>
    </span>;
}
