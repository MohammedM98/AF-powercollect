import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closingVersionDifferences } from '../../resources/js/lib/closingVersions.js';

test('submission differences keep currencies separate and exclude confirmations belonging to another period', () => {
    const previous = { closing_id: 4, snapshot: { boxes: [{ id: 1, status: 'received', head_counts: { ILS: '100', USD: '2' } }], electronic: [{ id: 10, currency: 'USD', amount: '20', status: 'pending' }], safeBalanceAtSubmission: { ILS: '100', USD: '2' } } };
    const version = { closing_id: 4, snapshot: { boxes: [...previous.snapshot.boxes, { id: 2, status: 'received', head_counts: { ILS: '0.10', JOD: '5' } }], electronic: [{ id: 10, currency: 'USD', amount: '20', status: 'confirmed', confirmed_in_closing_id: 4 }, { id: 11, currency: 'ILS', amount: '70', status: 'confirmed', confirmed_in_closing_id: 5 }], safeBalanceAtSubmission: { ILS: '100.10', USD: '2', JOD: '5' } } };

    const result = closingVersionDifferences(version, previous);

    assert.deepEqual(result.cash, { ILS: 0.1, USD: 0, JOD: 5 });
    assert.deepEqual(result.bank, { ILS: 0, USD: 20, JOD: 0 });
    assert.deepEqual(result.safe, { ILS: 0.1, USD: 0, JOD: 5 });
    assert.deepEqual(result.changed.boxes, [2]);
    assert.deepEqual(result.changed.electronic, [10, 11]);
});

test('a withdrawal followed by resubmission shows removed entries and status changes even when totals match', () => {
    const previous = { closing_id: 4, snapshot: { electronic: [{ id: 10, amount: '10', currency: 'ILS', status: 'pending' }, { id: 11, amount: '5', currency: 'USD', status: 'missing' }], transfers: [{ id: 1, amount: '40', currency: 'ILS', status: 'in_transit', proof_path: 'proof.jpg' }] } };
    const version = { closing_id: 4, snapshot: { electronic: [{ ...previous.snapshot.electronic[0], status: 'missing' }], transfers: [{ ...previous.snapshot.transfers[0], status: 'received' }] } };

    const result = closingVersionDifferences(version, previous);

    assert.deepEqual(result.bank, { ILS: 0, USD: 0, JOD: 0 });
    assert.deepEqual(result.changed.electronic, [10, 11]);
    assert.deepEqual(result.changed.transfers, [1]);
});
