/**
 * One statement row per ledger transaction and per weekly meter reading,
 * newest first, so both appear in the subscriber's single statement table.
 */
export function buildSubscriberStatement({ transactions = [], meterReadings = [] }) {
    const feeRows = transactions.map((transaction) => ({
        key: `transaction-${transaction.id}`,
        kind: 'fee',
        date: transaction.recordedAt,
        description: 'رسوم اشتراك',
        amount: transaction.amount,
        statusLabel: 'مستحق',
        statusTone: 'amber',
        recordedByName: transaction.recordedByName,
    }));

    const readingRows = meterReadings.map((reading) => ({
        key: `reading-${reading.id}`,
        kind: 'reading',
        date: reading.recordedAt,
        description: `قراءة أسبوعية ${reading.weekStart} ← ${reading.weekEnd}`,
        previousReading: reading.previous_reading,
        currentReading: reading.current_reading,
        consumption: reading.consumption,
        amount: reading.amountDue,
        statusLabel: reading.statusLabel,
        statusTone: reading.status === 'approved' ? 'green' : 'amber',
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
