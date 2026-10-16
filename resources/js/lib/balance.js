import { formatMoney } from './format.js';

/**
 * How a balance is shown everywhere, by the company's rule: positive is
 * what the subscription owes (in the company's favour), negative is credit
 * in the subscription's favour, shown with its minus sign. Only balances
 * carry a sign; payment and transaction amounts are always shown positive.
 */

/** What each kind of balance means, shown on hover. */
export const BALANCE_HINTS = {
    owes: 'عليه — لصالح الشركة',
    credit: 'له — لصالح المشترك',
    settled: 'مسدّد',
};

/** The colour of a balance where it is coloured: red owed, green credit, grey settled. */
export const BALANCE_TEXT_CLASSES = {
    owes: 'text-red-600 dark:text-red-400',
    credit: 'text-emerald-600 dark:text-emerald-400',
    settled: 'text-gray-500',
};

/** The same colours as a soft chip. */
export const BALANCE_CHIP_CLASSES = {
    owes: 'bg-red-500/10 text-red-700 dark:text-red-400',
    credit: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    settled: 'bg-gray-100 text-gray-600',
};

function cents(value) {
    return Math.round(Number(value ?? 0) * 100) || 0;
}

/** Owed, credit or settled, to the cent. */
export function balanceTone(value) {
    const amount = cents(value);

    return amount > 0 ? 'owes' : amount < 0 ? 'credit' : 'settled';
}

/** The balance as a number with its sign: "120", "-30.50", "0". */
export function signedBalance(value) {
    const amount = cents(value);

    return `${amount < 0 ? '-' : ''}${formatMoney(Math.abs(amount) / 100)}`;
}

/**
 * The balance with its unit for running text ("الرصيد بعد: ‎-30 ₪"),
 * isolated left to right so the minus stays before the number inside
 * Arabic text.
 */
export function balanceInText(value, unit = '₪') {
    return `⁦${signedBalance(value)} ${unit}⁩`;
}
