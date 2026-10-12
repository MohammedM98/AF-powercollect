const CURRENCIES = ['ILS', 'USD', 'JOD'];
const cents = (value) => Math.round(Number(value ?? 0) * 100);

function amounts(version) {
    const cash = Object.fromEntries(CURRENCIES.map((currency) => [currency, 0]));
    const bank = { ...cash };
    const clearing = { ...cash };
    const boxes = [...new Map([...(version.snapshot.boxes ?? []), ...(version.snapshot.carriedIn ?? [])].map((box) => [box.id, box])).values()];
    for (const box of boxes) {
        const settled = (version.snapshot.version ?? 1) >= 2 ? box.received_in_closing_id === version.closing_id : box.status === 'received';
        if (settled && (box.type ?? 'cash') === 'cash') {
            for (const currency of CURRENCIES) cash[currency] += cents(box.head_counts?.[currency]);
        }
    }
    for (const payment of version.snapshot.electronic ?? []) {
        if (payment.status === 'confirmed' && payment.confirmed_in_closing_id === version.closing_id) {
            bank[payment.currency] += cents(payment.amount);
        }
    }
    for (const entry of version.snapshot.clearings ?? []) {
        if (entry.status === 'confirmed' && entry.confirmed_in_closing_id === version.closing_id && (!entry.transaction || entry.transaction.status === 'active')) {
            clearing[entry.currency] += cents(entry.amount);
        }
    }
    return { cash, bank, clearing };
}

/** Differences between saved submissions, never live payment data. */
export function closingVersionDifferences(version, previous) {
    const currentAmounts = amounts(version);
    const oldAmounts = amounts(previous);
    const differences = {};
    for (const book of ['cash', 'bank', 'clearing']) {
        differences[book] = Object.fromEntries(CURRENCIES.map((currency) => [currency, (currentAmounts[book][currency] - oldAmounts[book][currency]) / 100]));
    }
    differences.safe = Object.fromEntries(CURRENCIES.map((currency) => [currency, (cents(version.snapshot.safeBalanceAtSubmission?.[currency]) - cents(previous.snapshot.safeBalanceAtSubmission?.[currency])) / 100]));
    differences.changed = {};
    for (const [key, fields] of Object.entries({ boxes: ['status', 'received_in_closing_id', 'collector_counts', 'head_counts', 'expected_counts', 'decisions', 'reason'], carriedIn: ['status', 'received_in_closing_id', 'head_counts'], electronic: ['amount', 'currency', 'status', 'confirmed_in_closing_id'], clearings: ['amount', 'currency', 'status', 'confirmed_in_closing_id'], transfers: ['amount', 'currency', 'status', 'proof_path'], adjustments: ['amount', 'currency', 'book', 'reason'] })) {
        const oldRows = new Map((previous.snapshot[key] ?? []).map((row) => [row.id, row]));
        const rows = version.snapshot[key] ?? [];
        const changed = rows.filter((row) => fields.some((field) => JSON.stringify(row[field]) !== JSON.stringify(oldRows.get(row.id)?.[field]))).map((row) => row.id);
        differences.changed[key] = [...changed, ...[...oldRows.keys()].filter((id) => !rows.some((row) => row.id === id))];
    }
    return differences;
}
