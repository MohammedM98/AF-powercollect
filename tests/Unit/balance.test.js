import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceInText, balanceTone, signedBalance } from '../../resources/js/lib/balance.js';

test('a positive balance is owed, a negative one is credit, zero is settled', () => {
    assert.equal(balanceTone(120), 'owes');
    assert.equal(balanceTone('-30.5'), 'credit');
    assert.equal(balanceTone('0.001'), 'settled');
    assert.equal(balanceTone(null), 'settled');
});

test('only a negative balance carries a sign', () => {
    assert.equal(signedBalance('120.00'), '120');
    assert.equal(signedBalance(-30.5), '-30.50');
    assert.equal(signedBalance(-1234), '-1,234');
    assert.equal(signedBalance('-0.004'), '0');
});

test('in running text the signed balance is isolated left to right', () => {
    assert.equal(balanceInText(-30), '⁦-30 ₪⁩');
});
