import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PAYMENT_METHOD, PAYMENT_METHOD_STORAGE_KEY, rememberPaymentMethod, rememberedPaymentMethod } from '../../resources/js/lib/paymentMethod.js';

const OFFERED = [{ value: 'cash' }, { value: 'bank_transfer' }];

function memory(initial = {}) {
    const values = { ...initial };

    return { getItem: (key) => values[key] ?? null, setItem: (key, value) => { values[key] = String(value); }, values };
}

test('a device that has never taken a payment starts on bank transfer, as before', () => {
    assert.equal(DEFAULT_PAYMENT_METHOD, 'bank_transfer');
    assert.equal(rememberedPaymentMethod(OFFERED, memory()), 'bank_transfer');
});

test('the next payment starts on the method the last one used', () => {
    const storage = memory();

    rememberPaymentMethod('cash', storage);

    assert.equal(storage.values[PAYMENT_METHOD_STORAGE_KEY], 'cash');
    assert.equal(rememberedPaymentMethod(OFFERED, storage), 'cash');
});

test('a remembered method that is no longer offered falls back to the default', () => {
    const storage = memory({ [PAYMENT_METHOD_STORAGE_KEY]: 'cheque' });

    assert.equal(rememberedPaymentMethod(OFFERED, storage), 'bank_transfer');
    assert.equal(rememberedPaymentMethod([{ value: 'cash' }], memory({ [PAYMENT_METHOD_STORAGE_KEY]: 'bank_transfer' })), 'bank_transfer');
});

test('blocked or failing storage never breaks the form', () => {
    const blocked = {
        getItem() { throw new Error('SecurityError'); },
        setItem() { throw new Error('QuotaExceededError'); },
    };

    assert.equal(rememberedPaymentMethod(OFFERED, blocked), 'bank_transfer');
    assert.doesNotThrow(() => rememberPaymentMethod('cash', blocked));
    assert.equal(rememberedPaymentMethod(OFFERED, null), 'bank_transfer');
    assert.doesNotThrow(() => rememberPaymentMethod('cash', null));
});
