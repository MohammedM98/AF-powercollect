/**
 * The statement page's filters, applied in the browser. Every line already
 * carries the balance it left, so hiding some lines never changes the
 * balances shown on the others.
 */
export function filterStatementEntries(entries, { search = '', direction = '', method = '', dateFrom = '', dateTo = '' } = {}) {
    if (dateFrom && dateTo && dateFrom > dateTo) {
        return [];
    }

    const query = search.trim().toLocaleLowerCase();

    return entries.filter((entry) => {
        const date = entry.date.slice(0, 10);
        const text = [
            entry.description,
            entry.kindLabel,
            entry.voucherNumber,
            entry.manualVoucherNumber,
            entry.amount,
            entry.recordedByName,
            entry.bankName,
            entry.referenceNumber,
            entry.notes,
        ]
            .filter((value) => value !== undefined && value !== null)
            .join(' ')
            .toLocaleLowerCase();

        return (
            (!query || text.includes(query)) &&
            (!direction || (direction === 'credit') === entry.isPayment) &&
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
        return { amount: value.toFixed(2), label: 'عليه', tone: 'owes' };
    }

    if (value < 0) {
        return { amount: (-value).toFixed(2), label: 'له', tone: 'credit' };
    }

    return { amount: '0.00', label: 'مسدّد', tone: 'settled' };
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

    // Rounded through the decimal text (78.225 → 78.23), as the server rounds it.
    return Number(`${Math.round(Number(`${value * rate}e2`))}e-2`);
}
