/**
 * An amount with two decimal places, or none when it is a whole number:
 * 50 → '50', 617.5 → '617.50'.
 */
export function formatAmount(amount) {
    return Number(amount).toFixed(2).replace(/\.00$/, '');
}

/** Rounded to cents through the decimal text (78.225 → 78.23), as the server rounds it. */
export function roundToCents(amount) {
    return Number(`${Math.round(Number(`${amount}e2`))}e-2`);
}

export function formatCurrency(amount) {
    if (amount === null || amount === undefined || amount === '') {
        return '—';
    }

    return `${formatAmount(amount)} شيكل`;
}
