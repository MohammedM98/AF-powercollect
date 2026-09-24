export function filterSubscriberTransactions(transactions, { search = '', dateFrom = '', dateTo = '' } = {}) {
    if (dateFrom && dateTo && dateFrom > dateTo) {
        return [];
    }

    const query = search.trim().toLocaleLowerCase();

    return transactions.filter((transaction) => {
        const date = transaction.recordedAt.slice(0, 10);
        const text = `رسوم اشتراك مستحق ${transaction.recordedByName ?? ''} ${transaction.amount} ${transaction.recordedAt}`.toLocaleLowerCase();

        return (!query || text.includes(query)) && (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
    });
}
