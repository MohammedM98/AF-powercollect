import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterSubscriberTransactions } from '../../resources/js/lib/subscriberTransactions.js';

const transactions = [
    { id: 1, amount: '50.00', recordedByName: 'Ahmad', recordedAt: '2026-09-23 08:00' },
    { id: 2, amount: '75.25', recordedByName: 'سارة', recordedAt: '2026-09-24 23:59' },
    { id: 3, amount: '100.00', recordedByName: null, recordedAt: '2026-09-25 09:00' },
];

test('search matches employee names, Arabic descriptions and amounts', () => {
    assert.deepEqual(filterSubscriberTransactions(transactions, { search: ' AHMAD ' }).map((row) => row.id), [1]);
    assert.deepEqual(filterSubscriberTransactions(transactions, { search: 'سارة' }).map((row) => row.id), [2]);
    assert.deepEqual(filterSubscriberTransactions(transactions, { search: '75.25' }).map((row) => row.id), [2]);
    assert.equal(filterSubscriberTransactions(transactions, { search: 'رسوم اشتراك' }).length, 3);
    assert.deepEqual(filterSubscriberTransactions(transactions, { search: 'missing' }), []);
});

test('date range includes both boundaries and combines with search', () => {
    assert.deepEqual(filterSubscriberTransactions(transactions, { dateFrom: '2026-09-23', dateTo: '2026-09-24' }).map((row) => row.id), [1, 2]);
    assert.deepEqual(filterSubscriberTransactions(transactions, { dateFrom: '2026-09-24', dateTo: '2026-09-24', search: 'سارة' }).map((row) => row.id), [2]);
    assert.deepEqual(filterSubscriberTransactions(transactions, { dateFrom: '2026-09-25', dateTo: '2026-09-23' }), []);
});

test('empty filters restore all transactions without modifying the source', () => {
    assert.deepEqual(filterSubscriberTransactions(transactions), transactions);
    assert.deepEqual(filterSubscriberTransactions([], { search: 'رسوم' }), []);
    assert.equal(transactions.length, 3);
});
