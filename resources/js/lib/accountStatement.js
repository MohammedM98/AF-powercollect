import { formatAmount } from './currency.js';

/**
 * The statement page's filters, applied in the browser. Every line already
 * carries the balance it left, so hiding some lines never changes the
 * balances shown on the others.
 */
/**
 * Whether a line matches the "نوع الحركة" filter: 'debit' (every charge),
 * 'credit' (every payment and discount), or one type of line.
 */
function matchesType(entry, type) {
    if (type === 'debit') {
        return !entry.isCredit;
    }

    if (type === 'credit') {
        return entry.isCredit;
    }

    return entry.type === type;
}

export function filterStatementEntries(entries, { search = '', type = '', method = '', dateFrom = '', dateTo = '' } = {}) {
    if (dateFrom && dateTo && dateFrom > dateTo) {
        return [];
    }

    const query = search.trim().toLocaleLowerCase();

    return entries.filter((entry) => {
        const date = entry.date.slice(0, 10);
        const text = [
            entry.description,
            entry.typeLabel,
            entry.details,
            entry.voucherNumber,
            entry.manualVoucherNumber,
            entry.amount,
            entry.recordedByName,
            entry.bankName,
            entry.referenceNumber,
        ]
            .filter((value) => value !== undefined && value !== null)
            .join(' ')
            .toLocaleLowerCase();

        return (
            (!query || text.includes(query)) &&
            (!type || matchesType(entry, type)) &&
            (!method || entry.paymentMethod === method) &&
            (!dateFrom || date >= dateFrom) &&
            (!dateTo || date <= dateTo)
        );
    });
}

/**
 * How a balance reads: a positive balance is what the subscriber owes
 * (عليه), a negative one is credit in their favour (له).
 */
export function describeBalance(balance) {
    const value = Number(balance);

    if (value > 0) {
        return { amount: formatAmount(value), label: 'عليه', tone: 'owes' };
    }

    if (value < 0) {
        return { amount: formatAmount(-value), label: 'له', tone: 'credit' };
    }

    return { amount: '0', label: 'مسدّد', tone: 'settled' };
}

/**
 * The shekels a payment takes off the balance: the amount at the
 * exchange rate (always 1 for shekels). Null until both are valid.
 */
export function paymentInShekels(amount, currency, exchangeRate) {
    const value = Number(amount);
    const rate = currency === 'ILS' ? 1 : Number(exchangeRate);

    if (!(value > 0) || !(rate > 0)) {
        return null;
    }

    return roundToCents(value * rate);
}

/**
 * What a discount takes off, in shekels: a percentage of what the
 * subscriber owes, kilowatts at their kilo price, or the shekels given.
 * Mirrors SubscriberTransaction::discountFor(). Null until the value is valid.
 */
export function discountAmount(method, value, owed, kiloPrice) {
    const number = Number(value);

    if (value === '' || !(number > 0)) {
        return null;
    }

    const amount = { percentage: (Number(owed) * number) / 100, kilowatt: number * Number(kiloPrice), shekel: number }[method];

    return amount === undefined ? null : roundToCents(amount);
}

/** Rounded through the decimal text (78.225 → 78.23), as the server rounds it. */
function roundToCents(amount) {
    return Number(`${Math.round(Number(`${amount}e2`))}e-2`);
}
