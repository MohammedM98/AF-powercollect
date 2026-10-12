const CURRENCIES = ['ILS', 'USD', 'JOD'];
const cents = (value) => Math.round(Number(value ?? 0) * 100);

function amounts(version) {
    const cash = Object.fromEntries(CURRENCIES.map((currency) => [currency, 0]));
    const bank = { ...cash };
    for (const box of version.snapshot.boxes ?? []) {
        if (box.status === 'received') {
            for (const currency of CURRENCIES) cash[currency] += cents(box.head_counts?.[currency]);
        }
    }
    for (const payment of version.snapshot.electronic ?? []) {
        if (payment.status === 'confirmed' && payment.confirmed_in_closing_id === version.closing_id) {
            bank[payment.currency] += cents(payment.amount);
        }
    }
    return { cash, bank };
}

/** Differences between saved submissions, never live payment data. */
export function closingVersionDifferences(version, previous) {
    const currentAmounts = amounts(version);
    const oldAmounts = amounts(previous);
    const differences = {};
    for (const book of ['cash', 'bank']) {
        differences[book] = Object.fromEntries(CURRENCIES.map((currency) => [currency, (currentAmounts[book][currency] - oldAmounts[book][currency]) / 100]));
    }
    differences.safe = Object.fromEntries(CURRENCIES.map((currency) => [currency, (cents(version.snapshot.safeBalanceAtSubmission?.[currency]) - cents(previous.snapshot.safeBalanceAtSubmission?.[currency])) / 100]));
    differences.changed = {};
    for (const [key, fields] of Object.entries({ boxes: ['status', 'collector_counts', 'head_counts', 'expected_counts', 'decisions', 'reason'], electronic: ['amount', 'currency', 'status', 'confirmed_in_closing_id'], transfers: ['amount', 'currency', 'status', 'proof_path'], adjustments: ['amount', 'currency', 'book', 'reason'] })) {
        const oldRows = new Map((previous.snapshot[key] ?? []).map((row) => [row.id, row]));
        const rows = version.snapshot[key] ?? [];
        const changed = rows.filter((row) => fields.some((field) => JSON.stringify(row[field]) !== JSON.stringify(oldRows.get(row.id)?.[field]))).map((row) => row.id);
        differences.changed[key] = [...changed, ...[...oldRows.keys()].filter((id) => !rows.some((row) => row.id === id))];
    }
    return differences;
}
