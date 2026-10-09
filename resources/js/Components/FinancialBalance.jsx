import { describeBalance } from '@/lib/accountStatement';
import { formatMoney } from '@/lib/format';

export const BALANCE_LABELS = {
    owes: 'مستحق للشركة',
    credit: 'رصيد للمشترك',
    settled: 'مسدّد',
};

/*
 * A balance's colors say whose money it is, never whether it is good or bad:
 * what the subscriber owes is amber, what the company owes the subscriber is
 * blue, and a settled account is neutral. Green is kept for money that was
 * actually received (see PAYMENT_TEXT), and red for money that went out or
 * went wrong.
 */
export const BALANCE_TEXT = {
    owes: 'text-amber-700 dark:text-amber-400',
    credit: 'text-blue-600',
    settled: 'text-gray-700',
};

export const BALANCE_CHIPS = {
    owes: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    credit: 'bg-blue-500/10 text-blue-600',
    settled: 'bg-gray-100 text-gray-700',
};

/** The same tones on a panel that is dark in both themes. */
export const BALANCE_DARK = {
    owes: 'text-amber-300',
    credit: 'text-sky-300',
    settled: 'text-white/80',
};

/** Money that was received. */
export const PAYMENT_TEXT = 'text-emerald-700 dark:text-emerald-400';

/** Money that was paid back out. */
export const REFUND_TEXT = 'text-red-700 dark:text-red-400';

/** Only actual money movement uses cash colors; adjustments keep a neutral amount. */
export function cashAmountClass(value) {
    return Number(value) > 0 ? '!text-emerald-700 dark:!text-emerald-400' : Number(value) < 0 ? '!text-red-700 dark:!text-red-400' : '!text-gray-700';
}

export function transactionMoneyClass(entry) {
    if (entry.isCancelled || entry.cancellation) {
        return BALANCE_TEXT.settled;
    }
    if (entry.closingAdjustment?.cashEffect != null) {
        return cashAmountClass(entry.closingAdjustment.cashEffect);
    }
    if (entry.type === 'refund') {
        return REFUND_TEXT;
    }
    if (entry.isReversal) {
        return BALANCE_TEXT.settled;
    }
    return entry.type === 'payment' ? PAYMENT_TEXT : BALANCE_TEXT.settled;
}

/**
 * A balance in a table or list: the amount alone, in the color of whose
 * money it is, set at the start of its cell like the column header above
 * it. What the color means is not printed on every row — a balance in the
 * subscriber's favour carries a minus sign, the wording is kept for hover
 * and screen readers, and the legend explains the colors.
 */
export default function FinancialBalance({ value, chip = false }) {
    const balance = describeBalance(value);
    const label = BALANCE_LABELS[balance.tone];

    return (
        <span title={label} className={`inline-block rounded-lg ${chip ? `px-3 py-2 ${BALANCE_CHIPS[balance.tone]}` : BALANCE_TEXT[balance.tone]}`}>
            <bdi dir="ltr" className="whitespace-nowrap font-display text-base font-semibold tabular-nums">{formatMoney(value)} ₪</bdi>
            <span className="sr-only">{label}</span>
        </span>
    );
}

/** One line saying what the colors of balances and payments mean. */
export function FinancialLegend() {
    return (
        <div aria-label="دليل الألوان" className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm leading-7 text-gray-600">
            <span className="font-semibold text-gray-700">دليل الألوان</span>
            <span className={`inline-flex items-center gap-2 ${BALANCE_TEXT.owes}`}><span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" />مستحق للشركة، لم يُحصّل بعد</span>
            <span className={`inline-flex items-center gap-2 ${BALANCE_TEXT.credit}`}><span aria-hidden="true" className="h-2 w-2 rounded-full bg-blue-600" />رصيد لصالح المشترك (بعلامة −)</span>
            <span className={`inline-flex items-center gap-2 ${PAYMENT_TEXT}`}><span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-600" />مقبوضات</span>
            <span>صفر: مسدّد</span>
        </div>
    );
}
