export function formatCurrency(amount) {
    if (amount === null || amount === undefined || amount === '') {
        return '—';
    }

    return `${Number(amount).toFixed(2)} شيكل`;
}

/**
 * A number with thousands separators ("12,170" or "1,255.00"), for large
 * totals set beside a separate "شيكل" label.
 */
export function formatAmount(amount, fractionDigits = 0) {
    return Number(amount ?? 0).toLocaleString('en-US', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    });
}
