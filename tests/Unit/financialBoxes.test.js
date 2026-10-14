import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryStatus, financialBoxTotals, financialBoxesTotals, filterFinancialBoxes, groupFinancialBoxes, sortFinancialBoxes } from '../../resources/js/lib/financialBoxes.js';

test('display totals exclude cancelled payments and keep foreign currencies separate', () => {
    const boxes = [{ payments: [
        { amount: '150.25', currency: 'ILS', transaction: { status: 'active' } },
        { amount: '90', currency: 'ILS', transaction: { status: 'cancelled' } },
        { amount: '12', currency: 'USD' },
    ] }, { totals: { ILS: '25', JOD: '3' } }];

    assert.deepEqual(financialBoxTotals(boxes[0]), { ILS: 150.25, USD: 12, JOD: 0 });
    assert.deepEqual(financialBoxesTotals(boxes), { ILS: 175.25, USD: 12, JOD: 3 });
    assert.deepEqual(financialBoxesTotals([]), { ILS: 0, USD: 0, JOD: 0 });
});

test('status, employee and trimmed search filters work together', () => {
    const boxes = [
        { number: 12, status: 'pending', user: { id: 3, name: 'أحمد سالم' } },
        { number: 13, status: 'open', user: { id: 3, name: 'أحمد سالم' } },
        { number: 14, status: 'pending', user: { id: 4, name: 'أحمد علي' } },
    ];

    assert.deepEqual(filterFinancialBoxes(boxes, { status: 'pending', person: '3', search: ' أحمد ' }).map((box) => box.number), [12]);
    assert.deepEqual(filterFinancialBoxes(boxes, { search: '13' }).map((box) => box.number), [13]);
    assert.deepEqual(filterFinancialBoxes(boxes, { person: '9' }), []);
});

test('direct payments can be selected without including employee boxes', () => {
    const boxes = [{ number: 1, status: 'open', user: null }, { number: 2, status: 'pending', user: { id: 2, name: 'موظف' } }];

    assert.deepEqual(filterFinancialBoxes(boxes, { person: 'direct', search: 'المباشرة' }).map((box) => box.number), [1]);
});

test('sorting prioritizes waiting boxes and supports numeric amounts, numbers and dates in both directions', () => {
    const boxes = [
        { number: '10', status: 'received', totals: { ILS: 50 }, opened_at: '2026-10-01', closed_at: '2026-10-05' },
        { number: '2', status: 'pending', totals: { ILS: 100 }, opened_at: '2026-10-02', closed_at: '2026-10-03' },
        { number: '3', status: 'open', totals: { ILS: 20 }, opened_at: '2026-10-04' },
    ];

    assert.deepEqual(sortFinancialBoxes(boxes).map((box) => box.number), ['2', '3', '10']);
    assert.deepEqual(sortFinancialBoxes(boxes, { key: 'number', direction: 'asc' }).map((box) => box.number), ['2', '3', '10']);
    assert.deepEqual(sortFinancialBoxes(boxes, { key: 'total', direction: 'desc' }).map((box) => box.number), ['2', '10', '3']);
    assert.deepEqual(sortFinancialBoxes(boxes, { key: 'dates', direction: 'asc' }).map((box) => box.number), ['2', '3', '10']);
    assert.deepEqual(boxes.map((box) => box.number), ['10', '2', '3']);
});

test('employee groups keep same-name employees separate, waiting employees first and direct payments last', () => {
    const boxes = [
        { number: 1, status: 'open', user: { id: 1, name: 'أحمد' } },
        { number: 2, status: 'pending', user: { id: 2, name: 'أحمد' } },
        { number: 3, status: 'pending', user: { id: 2, name: 'أحمد' } },
        { number: 4, status: 'pending', user: null },
    ];

    const groups = groupFinancialBoxes(boxes);

    assert.deepEqual(groups.map((group) => group.key), ['2', '1', 'direct']);
    assert.deepEqual(groups[0].boxes.map((box) => box.number), [2, 3]);
    assert.equal(groups[2].name, 'الدفعات المباشرة');
});

test('an entry is in effect until cancelled, whether or not the audit has checked it yet', () => {
    assert.deepEqual(entryStatus({ status: 'pending', transactionStatus: 'active' }), ['سارية', 'green']);
    assert.deepEqual(entryStatus({ status: 'confirmed', transaction: { status: 'active' } }), ['سارية', 'green']);
    assert.deepEqual(entryStatus({ status: 'cash' }), ['سارية', 'green']);
    assert.deepEqual(entryStatus({ status: 'missing', transactionStatus: 'active' }), ['غير موجودة في البنك', 'red']);
    assert.deepEqual(entryStatus({ status: 'rejected', transaction: { status: 'active' } }), ['مرفوضة', 'red']);
    assert.deepEqual(entryStatus({ status: 'missing', transactionStatus: 'cancelled' }), ['ملغاة', 'gray']);
});
