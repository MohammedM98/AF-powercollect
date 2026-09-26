/** How each kind of ledger transaction is described in the statement. */
const TRANSACTION_DESCRIPTIONS = {
    subscription_fee: 'رسوم اشتراك',
};

/**
 * One statement row per ledger transaction and per approved weekly meter
 * reading, newest first. A reading reaches the statement (and the balance)
 * only once it is approved; its charge is shown on the reading's own row
 * rather than again as a separate transaction.
 */
export function buildSubscriberStatement({ transactions = [], meterReadings = [] }) {
    const feeRows = transactions
        .filter((transaction) => transaction.type !== 'meter_reading')
        .map((transaction) => ({
            key: `transaction-${transaction.id}`,
            kind: 'fee',
            date: transaction.recordedAt,
            description: TRANSACTION_DESCRIPTIONS[transaction.type] ?? 'معاملة',
            amount: transaction.amount,
            statusLabel: 'مستحق',
            statusTone: 'amber',
            recordedByName: transaction.recordedByName,
        }));

    const readingRows = meterReadings
        .filter((reading) => reading.status === 'approved')
        .map((reading) => ({
            key: `reading-${reading.id}`,
            kind: 'reading',
            date: reading.recordedAt,
            description: `قراءة أسبوعية ${reading.weekStart} ← ${reading.weekEnd}`,
            previousReading: reading.previous_reading,
            currentReading: reading.current_reading,
            consumption: reading.consumption,
            amount: reading.amountDue,
            statusLabel: reading.statusLabel,
            statusTone: 'green',
            recordedByName: reading.recordedByName,
            reading,
        }));

    return [...readingRows, ...feeRows].sort((a, b) => b.date.localeCompare(a.date));
}

export function filterSubscriberStatement(rows, { search = '', dateFrom = '', dateTo = '' } = {}) {
    if (dateFrom && dateTo && dateFrom > dateTo) {
        return [];
    }

    const query = search.trim().toLocaleLowerCase();

    return rows.filter((row) => {
        const date = row.date.slice(0, 10);
        const text = [row.description, row.statusLabel, row.recordedByName, row.amount, row.currentReading, row.date]
            .filter((value) => value !== undefined && value !== null)
            .join(' ')
            .toLocaleLowerCase();

        return (!query || text.includes(query)) && (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
    });
}
