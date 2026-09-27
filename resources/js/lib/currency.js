/**
 * An amount with two decimal places, or none when it is a whole number:
 * 50 → '50', 617.5 → '617.50'.
 */
export function formatAmount(amount) {
    return Number(amount).toFixed(2).replace(/\.00$/, '');
}

export function formatCurrency(amount) {
    if (amount === null || amount === undefined || amount === '') {
        return '—';
    }

    return `${formatAmount(amount)} شيكل`;
}
