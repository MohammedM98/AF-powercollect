import Icon from '@/Components/Icon';
import { formatMoney } from '@/lib/format';
import { BankMark } from '@/Pages/Subscriptions/PaymentModal';

/** What a box's summary groups its entries by, for each type of box. */
const groupings = {
    bank_transfer: { title: 'ملخص الصندوق حسب البنك', key: (entry) => entry.bankName || 'بنك غير محدد' },
    clearing: { title: 'ملخص الصندوق حسب الخدمة', key: (entry) => entry.service || 'خدمة غير محددة' },
    cash: { title: 'ملخص الصندوق حسب عملة الدفع', key: (entry) => entry.currencyLabel || 'شيكل' },
};

/**
 * A box's entry (as the branch's boxes send it, with its transaction and
 * its statement line) in the shape the summary groups.
 */
export function breakdownEntry(entry) {
    return {
        amount: entry.amount,
        bankName: entry.ledger?.bankName ?? entry.transaction?.bank_name ?? null,
        service: entry.transaction?.notes ?? null,
        currencyLabel: entry.ledger?.currencyLabel ?? null,
        paidAmount: entry.ledger?.paidAmount ?? entry.amount,
        currency: entry.ledger && !entry.ledger.isShekel ? entry.ledger.currencyLabel : 'ILS',
    };
}

/**
 * The entries in effect, grouped by bank (transfers), service (clearings)
 * or the currency they were paid in (cash): each group's count, its total
 * in shekels and, for a foreign currency, what was paid in it. Largest
 * total first.
 */
export function groupBoxEntries(type, entries) {
    const groupKey = (groupings[type] ?? groupings.cash).key;
    const groups = new Map();
    entries.forEach((entry) => {
        const key = groupKey(entry);
        const group = groups.get(key) ?? { key, count: 0, total: 0, paid: 0, foreign: false };
        group.count += 1;
        group.total += Number(entry.amount);
        group.paid += Number(entry.paidAmount ?? entry.amount);
        group.foreign = group.foreign || (entry.currency && entry.currency !== 'ILS');
        groups.set(key, group);
    });

    return [...groups.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key, 'ar'));
}

/**
 * The last group stretched over the rest of its row, so no empty cell
 * is left: two to a row, or three when `wide`.
 */
function lastSpan(count, wide) {
    const pair = count % 2 === 1 ? 'sm:col-span-2' : '';
    const trio = { 0: 'xl:col-span-1', 1: 'xl:col-span-3', 2: 'xl:col-span-2' }[count % 3];

    return wide ? `${pair} ${trio}` : pair;
}

function GroupMark({ type, label }) {
    if (type === 'bank_transfer') {
        return <BankMark bank={label} />;
    }

    return <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${type === 'clearing' ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}><Icon name={type === 'clearing' ? 'scale' : 'banknotes'} className="h-5 w-5" /></span>;
}

/**
 * The summary the branch looks over before closing a box (or every open
 * box of a type): its entries in effect grouped by bank, service or
 * currency paid, each with its logo or icon, count, total and share;
 * `wide` lays the groups out three to a row on large screens.
 */
export default function BoxBreakdown({ type, entries, wide = false, className = '' }) {
    const groups = groupBoxEntries(type, entries);
    const total = groups.reduce((sum, group) => sum + group.total, 0);
    const count = groups.reduce((sum, group) => sum + group.count, 0);
    if (!groups.length) {
        return null;
    }

    return <section aria-label={(groupings[type] ?? groupings.cash).title} className={`overflow-hidden rounded-panel border border-gray-100 bg-surface ${className}`}>
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
            <h3 className="font-bold text-gray-900">{(groupings[type] ?? groupings.cash).title}</h3>
            <p className="text-sm text-gray-600"><b className="font-display text-gray-900">{count}</b> حركة سارية · <b dir="ltr" className="font-display text-gray-900">{formatMoney(total)}</b> شيكل</p>
        </header>
        <ul className={`grid gap-px bg-gray-100 sm:grid-cols-2 ${wide ? 'xl:grid-cols-3' : ''}`}>
            {groups.map((group, index) => <li key={group.key} className={`flex items-center gap-3 bg-surface p-3 ${index === groups.length - 1 ? lastSpan(groups.length, wide) : ''}`}>
                <GroupMark type={type} label={group.key} />
                <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-gray-900" title={group.key}>{group.key}</p>
                    <p className="text-xs text-gray-500"><b className="font-display text-gray-700">{group.count}</b> حركة{group.foreign ? <> · دُفع <bdi dir="ltr" className="font-display">{formatMoney(group.paid)}</bdi></> : ''}</p>
                    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full bg-gray-900/70" style={{ width: `${total ? Math.max(2, Math.round((group.total / total) * 100)) : 0}%` }} /></span>
                </div>
                <p className="shrink-0 text-end"><b dir="ltr" className="block font-display text-gray-900">{formatMoney(group.total)}</b><span className="text-xs text-gray-500">شيكل</span></p>
            </li>)}
        </ul>
    </section>;
}
