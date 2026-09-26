import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSubscriberStatement, filterSubscriberStatement } from '../../resources/js/lib/subscriberTransactions.js';

const transactions = [
    { id: 1, type: 'subscription_fee', amount: '50.00', recordedByName: 'Ahmad', recordedAt: '2026-09-23 08:00' },
    { id: 2, type: 'subscription_fee', amount: '75.25', recordedByName: 'سارة', recordedAt: '2026-09-24 23:59' },
    { id: 3, type: 'meter_reading', amount: '12.00', recordedByName: 'المحاسب', recordedAt: '2026-09-25 09:00' },
];

const meterReadings = [
    {
        id: 7,
        status: 'approved',
        statusLabel: 'معتمدة',
        weekStart: '2026-09-11',
        weekEnd: '2026-09-17',
        previous_reading: 1200,
        current_reading: 1250,
        consumption: 50,
        amountDue: '12.00',
        recordedByName: 'مدخل البيانات',
        recordedAt: '2026-09-18 10:00',
    },
    {
        id: 8,
        status: 'pending',
        statusLabel: 'قيد المراجعة',
        weekStart: '2026-09-18',
        weekEnd: '2026-09-24',
        previous_reading: 1250,
        current_reading: 1290,
        consumption: 40,
        amountDue: '10.00',
        recordedByName: 'مدخل البيانات',
        recordedAt: '2026-09-25 10:00',
    },
];

const statement = buildSubscriberStatement({ transactions, meterReadings });

test('a reading reaches the statement only once approved, and its charge is not listed twice', () => {
    assert.deepEqual(
        statement.map((row) => row.key),
        ['transaction-2', 'transaction-1', 'reading-7'],
    );
    assert.equal(statement.find((row) => row.key === 'reading-7').amount, '12.00');
    assert.equal(statement.find((row) => row.key === 'transaction-1').description, 'رسوم اشتراك');
});

test('search matches employee names, Arabic descriptions and amounts', () => {
    assert.deepEqual(filterSubscriberStatement(statement, { search: ' AHMAD ' }).map((row) => row.key), ['transaction-1']);
    assert.deepEqual(filterSubscriberStatement(statement, { search: 'سارة' }).map((row) => row.key), ['transaction-2']);
    assert.deepEqual(filterSubscriberStatement(statement, { search: '75.25' }).map((row) => row.key), ['transaction-2']);
    assert.equal(filterSubscriberStatement(statement, { search: 'رسوم اشتراك' }).length, 2);
    assert.deepEqual(filterSubscriberStatement(statement, { search: 'missing' }), []);
});

test('date range includes both boundaries and combines with search', () => {
    assert.deepEqual(filterSubscriberStatement(statement, { dateFrom: '2026-09-23', dateTo: '2026-09-24' }).map((row) => row.key), [
        'transaction-2',
        'transaction-1',
    ]);
    assert.deepEqual(filterSubscriberStatement(statement, { dateFrom: '2026-09-24', dateTo: '2026-09-24', search: 'سارة' }).map((row) => row.key), ['transaction-2']);
    assert.deepEqual(filterSubscriberStatement(statement, { dateFrom: '2026-09-25', dateTo: '2026-09-23' }), []);
});

test('empty filters restore every row without modifying the source', () => {
    assert.deepEqual(filterSubscriberStatement(statement), statement);
    assert.deepEqual(filterSubscriberStatement([], { search: 'رسوم' }), []);
    assert.equal(statement.length, 3);
});
