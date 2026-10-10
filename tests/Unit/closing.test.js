import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    addDays,
    businessDayHours,
    cashCheck,
    closingMoney,
    closingSteps,
    countedCash,
    hasCount,
    monthName,
    monthOf,
    paymentsCount,
    weekOf,
} from '../../resources/js/lib/closing.js';

test('the counted cash adds up the notes and coins', () => {
    assert.equal(countedCash({ 200: 4, 100: 1, 50: 1, 1: 3 }), 953);
    assert.equal(countedCash({ 200: '', 10: '2' }), 20);
    assert.equal(hasCount({ 200: 0 }), false);
    // Agorot are counted as hundredths of a shekel, without floating-point drift.
    assert.equal(countedCash({ 100: 1, 50: 1, agorot: 55 }), 150.55);
    assert.equal(countedCash({ 1: 1, agorot: '7' }), 1.07);
    assert.equal(countedCash({ agorot: 29 }), 0.29);
    assert.equal(hasCount({ agorot: 5 }), true);
    assert.equal(hasCount({ 5: 1 }), true);
});

test('the count is checked against the expected cash', () => {
    assert.deepEqual(cashCheck(950, 1000), { difference: -50, tone: 'bad', label: 'نقص 50.00 ₪' });
    assert.deepEqual(cashCheck(1010, 1000), { difference: 10, tone: 'bad', label: 'زيادة 10.00 ₪' });
    assert.equal(cashCheck(1000, '1000.00').tone, 'ok');
});

test('the review steps follow the closing status', () => {
    assert.deepEqual(
        closingSteps('draft').map((step) => step.state),
        ['done', 'cur', '', ''],
    );
    assert.deepEqual(
        closingSteps('submitted').map((step) => step.state),
        ['done', 'done', 'cur', ''],
    );
    assert.deepEqual(closingSteps('returned').map((step) => [step.label, step.state])[1], ['معاد للتصحيح', 'bad']);
    assert.deepEqual(
        closingSteps('approved').map((step) => step.state),
        ['done', 'done', 'done', 'done'],
    );
});

test('dates, months, money and counts read as the design shows them', () => {
    assert.equal(closingMoney(1800), '1,800.00');
    assert.equal(monthName('2026-09-30'), 'أيلول 2026');
    assert.equal(addDays('2026-09-30', 1), '2026-10-01');
    assert.equal(paymentsCount(3), '3 دفعات');
});

test('the cut-off and week start shape the business day and week', () => {
    assert.equal(businessDayHours('00:00'), 'من بداية اليوم حتى منتصف الليل');
    assert.equal(businessDayHours('18:00'), 'من الساعة 18:00 في اليوم السابق حتى الساعة 18:00');
    assert.deepEqual(weekOf('2026-09-30', 6), ['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    assert.equal(weekOf('2026-09-30', 0)[0], '2026-09-27');
    assert.deepEqual(monthOf('2026-09-30'), ['2026-09-01', '2026-09-30']);
    assert.deepEqual(monthOf('2028-02-10'), ['2028-02-01', '2028-02-29']);
    assert.deepEqual(monthOf('2026-12-05'), ['2026-12-01', '2026-12-31']);
});
