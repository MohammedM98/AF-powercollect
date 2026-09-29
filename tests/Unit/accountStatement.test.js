import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    describeBalance,
    discountAmount,
    filterStatementEntries,
    foldCorrections,
    paymentInShekels,
} from '../../resources/js/lib/accountStatement.js';

const entries = [
    {
        id: 1,
        date: '2026-08-20 09:15',
        description: 'رسوم اشتراك جديد',
        type: 'subscription_fee',
        typeLabel: 'رسوم اشتراك',
        isCredit: false,
        amount: '50.00',
        recordedByName: 'سارة',
    },
    {
        id: 2,
        date: '2026-08-30 12:40',
        description: 'دفعة نقدية',
        type: 'payment',
        typeLabel: 'دفعة',
        isCredit: true,
        paymentMethod: 'cash',
        voucherNumber: '000118',
        amount: '20.00',
        recordedByName: 'Mohammed',
    },
    {
        id: 3,
        date: '2026-09-13 14:20',
        description: 'دفعة بتحويل بنكي',
        type: 'payment',
        typeLabel: 'دفعة',
        isCredit: true,
        paymentMethod: 'bank_transfer',
        bankName: 'بنك فلسطين',
        referenceNumber: 'TRX-88214',
        amount: '49.30',
        recordedByName: 'علي',
    },
    {
        id: 4,
        date: '2026-09-20 08:00',
        description: 'خصم بمبلغ ثابت',
        type: 'discount',
        typeLabel: 'خصم',
        isCredit: true,
        amount: '10.00',
        details: 'تعويض عن انقطاع الكهرباء',
        recordedByName: 'علي',
    },
];

const ids = (rows) => rows.map((row) => row.id);

test('filters by every charge, every payment and discount, one type, or payment method', () => {
    assert.deepEqual(ids(filterStatementEntries(entries, { type: 'debit' })), [1]);
    assert.deepEqual(ids(filterStatementEntries(entries, { type: 'credit' })), [2, 3, 4]);
    assert.deepEqual(ids(filterStatementEntries(entries, { type: 'discount' })), [4]);
    assert.deepEqual(ids(filterStatementEntries(entries, { method: 'bank_transfer' })), [3]);
});

test('search matches voucher numbers, banks, references and employee names', () => {
    assert.deepEqual(ids(filterStatementEntries(entries, { search: '000118' })), [2]);
    assert.deepEqual(ids(filterStatementEntries(entries, { search: 'بنك فلسطين' })), [3]);
    assert.deepEqual(ids(filterStatementEntries(entries, { search: ' trx-88214 ' })), [3]);
    assert.deepEqual(ids(filterStatementEntries(entries, { search: 'MOHAMMED' })), [2]);
    assert.deepEqual(ids(filterStatementEntries(entries, { search: 'انقطاع' })), [4]);
});

test('the date range includes both ends, and a reversed range matches nothing', () => {
    assert.deepEqual(ids(filterStatementEntries(entries, { dateFrom: '2026-08-30', dateTo: '2026-09-13' })), [2, 3]);
    assert.deepEqual(filterStatementEntries(entries, { dateFrom: '2026-09-13', dateTo: '2026-08-30' }), []);
    assert.deepEqual(filterStatementEntries(entries), entries);
});

test('a balance reads as owed, in credit or settled', () => {
    assert.deepEqual(describeBalance('54.10'), { amount: '54.10', label: 'عليه', tone: 'owes' });
    assert.deepEqual(describeBalance('-9.10'), { amount: '9.10', label: 'له', tone: 'credit' });
    assert.deepEqual(describeBalance('0.00'), { amount: '0', label: 'مسدّد', tone: 'settled' });
    // Whole amounts drop the .00.
    assert.deepEqual(describeBalance('50.00'), { amount: '50', label: 'عليه', tone: 'owes' });
});

test('a payment in shekels ignores the rate; others are converted at it', () => {
    assert.equal(paymentInShekels('54.10', 'ILS', '3.7'), 54.1);
    assert.equal(paymentInShekels('20', 'USD', '3.7'), 74);
    assert.equal(paymentInShekels('15', 'JOD', '5.215'), 78.23);
    assert.equal(paymentInShekels('20', 'USD', ''), null);
    assert.equal(paymentInShekels('', 'ILS', '1'), null);
});

test('a discount is a percentage of what is owed, kilowatts at the kilo price, or shekels', () => {
    assert.equal(discountAmount('percentage', '10', '250.00', '0.60'), 25);
    assert.equal(discountAmount('kilowatt', '25', '250.00', '0.60'), 15);
    assert.equal(discountAmount('shekel', '30', '250.00', '0.60'), 30);
    assert.equal(discountAmount('percentage', '12.5', '78.18', '0.60'), 9.77);
    assert.equal(discountAmount('shekel', '', '250.00', '0.60'), null);
    assert.equal(discountAmount('shekel', '0', '250.00', '0.60'), null);
});

const corrections = [
    { id: 1, groupId: 1, type: 'meter_reading' },
    { id: 2, groupId: 2, type: 'payment', cancellation: { wasCorrected: true } },
    { id: 3, groupId: 2, type: 'reversal', isReversal: true, isFollowUp: true },
    { id: 4, groupId: 2, type: 'payment', isFollowUp: true, isCorrection: true },
    { id: 5, groupId: 5, type: 'payment', cancellation: { wasCorrected: false } },
    { id: 6, groupId: 5, type: 'reversal', isReversal: true, isFollowUp: true },
];

test('a corrected line folds under its replacement and a deleted one under its reversal', () => {
    const folded = foldCorrections(corrections, corrections, new Set());

    assert.deepEqual(
        folded.map((entry) => entry.id),
        [1, 4, 6],
    );
    assert.equal(folded[0].history, null);
    assert.deepEqual(folded[1].history, { hiddenCount: 2, expanded: false, isHead: true });
    assert.deepEqual(folded[2].history, { hiddenCount: 1, expanded: false, isHead: true });
});

test('an opened group shows all its lines, and the others stay folded', () => {
    const opened = foldCorrections(corrections, corrections, new Set([2]));

    assert.deepEqual(
        opened.map((entry) => entry.id),
        [1, 2, 3, 4, 6],
    );
    assert.deepEqual(opened[1].history, { hiddenCount: 2, expanded: true, isHead: false });
    assert.deepEqual(
        foldCorrections(corrections, corrections, new Set([5])).map((entry) => entry.id),
        [1, 4, 5, 6],
    );
});

test('a folded line shows when the filters hide the line that stands for it', () => {
    const cancelledOnly = corrections.filter((entry) => entry.id === 2);

    assert.deepEqual(
        foldCorrections(corrections, cancelledOnly, new Set()).map((entry) => entry.id),
        [2],
    );
});
