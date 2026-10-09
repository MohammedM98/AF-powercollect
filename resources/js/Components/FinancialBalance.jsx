import { describeBalance } from '@/lib/accountStatement';
import { formatMoney } from '@/lib/format';

export const BALANCE_LABELS = {
    owes: 'مستحق للشركة',
    credit: 'رصيد للمشترك',
    settled: 'مسدّد',
};

export const BALANCE_TEXT = {
    owes: 'text-emerald-700 dark:text-emerald-400',
    credit: 'text-red-700 dark:text-red-400',
    settled: 'text-gray-700',
};

export const BALANCE_CHIPS = {
    owes: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    credit: 'bg-red-500/10 text-red-700 dark:text-red-400',
    settled: 'bg-gray-100 text-gray-700',
};

export const BALANCE_DARK = {
    owes: 'text-emerald-300',
    credit: 'text-red-300',
    settled: 'text-white/80',
};

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
        return BALANCE_TEXT.credit;
    }
    if (entry.isReversal) {
        return BALANCE_TEXT.settled;
    }
    return entry.type === 'payment' ? BALANCE_TEXT.owes : BALANCE_TEXT.settled;
}

/** Colors describe whose balance it is; the amount and accounting sign stay unchanged. */
export default function FinancialBalance({ value, chip = false, signed = false }) {
    const balance = describeBalance(value);
    return (
        <span className={`inline-flex flex-col gap-1 rounded-lg ${chip ? `px-3 py-2 ${BALANCE_CHIPS[balance.tone]}` : BALANCE_TEXT[balance.tone]}`}>
            <bdi dir="ltr" className="whitespace-nowrap font-display text-base font-semibold tabular-nums">{formatMoney(signed ? value : balance.amount)} ₪</bdi>
            <span className="whitespace-nowrap text-sm font-medium">{BALANCE_LABELS[balance.tone]}</span>
        </span>
    );
}

export function FinancialLegend() {
    return (
        <div aria-label="دليل ألوان الرصيد" className="flex flex-wrap gap-x-6 gap-y-3 rounded-xl border border-gray-200 bg-surface px-5 py-4 text-sm leading-7">
            <span className="font-semibold text-gray-700">ألوان الرصيد من منظور الشركة</span>
            <span className="inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-400"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-600" />موجب: مستحق للشركة، لم يُحصّل بعد</span>
            <span className="inline-flex items-center gap-2 text-red-700 dark:text-red-400"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-red-600" />سالب: رصيد لصالح المشترك</span>
            <span className="text-gray-600">صفر: مسدّد</span>
        </div>
    );
}
