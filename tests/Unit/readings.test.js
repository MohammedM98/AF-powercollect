import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readingDiscount, weeklyCharges } from '../../resources/js/lib/readings.js';

// The example week: 5 kilos at 30 shekels a kilo is a 150 shekel bill; the minimum is 20 a week.
test('a week is billed consumption × kilo price, less its standing discount', () => {
    assert.deepEqual(weeklyCharges(5, '30.00', '20.00'), { readingFee: 150, discountAmount: 0, amountDue: 150, minimumApplies: false });
    assert.deepEqual(weeklyCharges(5, '30.00', '20.00', { method: 'kilowatt', value: '3' }), {
        readingFee: 150,
        discountAmount: 90,
        amountDue: 60,
        minimumApplies: false,
    });
    assert.deepEqual(weeklyCharges(5, '30.00', '20.00', { method: 'percentage', value: '10' }), {
        readingFee: 150,
        discountAmount: 15,
        amountDue: 135,
        minimumApplies: false,
    });
    assert.deepEqual(weeklyCharges(5, '30.00', '20.00', { method: 'shekel', value: '5' }), {
        readingFee: 150,
        discountAmount: 25,
        amountDue: 125,
        minimumApplies: false,
    });
});

test('the weekly minimum is still due when the discount leaves less, and the discount counts only what it took off', () => {
    assert.deepEqual(weeklyCharges(2, '30.00', '20.00', { method: 'kilowatt', value: '3' }), {
        readingFee: 60,
        discountAmount: 40,
        amountDue: 20,
        minimumApplies: true,
    });
    assert.deepEqual(weeklyCharges(0.5, '30.00', '20.00', { method: 'percentage', value: '50' }), {
        readingFee: 15,
        discountAmount: 0,
        amountDue: 20,
        minimumApplies: true,
    });
});

test('a standing discount never takes off more than the reading, nor anything from a negative one', () => {
    assert.equal(readingDiscount({ method: 'kilowatt', value: '10' }, 2.5, '0.60'), 1.5);
    assert.equal(readingDiscount({ method: 'shekel', value: '40' }, 2, '30.00'), 60);
    assert.equal(readingDiscount({ method: 'percentage', value: '10' }, 3.33, '0.45'), 0.15);
    assert.equal(readingDiscount({ method: 'kilowatt', value: '3' }, -2, '30.00'), 0);
});
