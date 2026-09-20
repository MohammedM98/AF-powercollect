export function formatCurrency(amount) {
    if (amount === null || amount === undefined || amount === '') {
        return '—';
    }

    return `${Number(amount).toFixed(2)} ₪`;
}
