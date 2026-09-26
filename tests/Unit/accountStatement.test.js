import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeBalance, filterStatementEntries, paymentInShekels } from '../../resources/js/lib/accountStatement.js';

const entries = [
    {
        id: 1,
        date: '2026-08-20 09:15',
        description: 'رسوم اشتراك جديد',
        kindLabel: 'تحميل · رسوم اشتراك',
        isPayment: false,
        amount: '50.00',
        recordedByName: 'سارة',
    },
    {
        id: 2,
        date: '2026-08-30 12:40',
        description: 'دفعة نقدية',
        kindLabel: 'تسديد · دفعة',
        isPayment: true,
        paymentMethod: 'cash',
        voucherNumber: '000118',
        amount: '20.00',
        recordedByName: 'Mohammed',
    },
    {
        id: 3,
        date: '2026-09-13 14:20',
        description: 'دفعة بتحويل بنكي',
        kindLabel: 'تسديد · دفعة',
        isPayment: true,
        paymentMethod: 'bank_transfer',
        bankName: 'بنك فلسطين',
        referenceNumber: 'TRX-88214',
        amount: '49.30',
        recordedByName: 'علي',
    },
];

const ids = (rows) => rows.map((row) => row.id);

test('filters by direction and payment method', () => {
    assert.deepEqual(ids(filterStatementEntries(entries, { direction: 'debit' })), [1]);
    assert.deepEqual(ids(filterStatementEntries(entries, { direction: 'credit' })), [2, 3]);
    assert.deepEqual(ids(filterStatementEntries(entries, { method: 'bank_transfer' })), [3]);
});

test('search matches voucher numbers, banks, references and employee names', () => {
    assert.deepEqual(ids(filterStatementEntries(entries, { search: '000118' })), [2]);
    assert.deepEqual(ids(filterStatementEntries(entries, { search: 'بنك فلسطين' })), [3]);
    assert.deepEqual(ids(filterStatementEntries(entries, { search: ' trx-88214 ' })), [3]);
    assert.deepEqual(ids(filterStatementEntries(entries, { search: 'MOHAMMED' })), [2]);
});

test('the date range includes both ends, and a reversed range matches nothing', () => {
    assert.deepEqual(ids(filterStatementEntries(entries, { dateFrom: '2026-08-30', dateTo: '2026-09-13' })), [2, 3]);
    assert.deepEqual(filterStatementEntries(entries, { dateFrom: '2026-09-13', dateTo: '2026-08-30' }), []);
    assert.deepEqual(filterStatementEntries(entries), entries);
});

test('a balance reads as owed, in credit or settled', () => {
    assert.deepEqual(describeBalance('54.10'), { amount: '54.10', label: 'عليه', tone: 'owes' });
    assert.deepEqual(describeBalance('-9.10'), { amount: '9.10', label: 'له', tone: 'credit' });
    assert.deepEqual(describeBalance('0.00'), { amount: '0.00', label: 'مسدّد', tone: 'settled' });
});

test('a payment in shekels ignores the rate; others are converted at it', () => {
    assert.equal(paymentInShekels('54.10', 'ILS', '3.7'), 54.1);
    assert.equal(paymentInShekels('20', 'USD', '3.7'), 74);
    assert.equal(paymentInShekels('15', 'JOD', '5.215'), 78.23);
    assert.equal(paymentInShekels('20', 'USD', ''), null);
    assert.equal(paymentInShekels('', 'ILS', '1'), null);
});
