import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeReadingStatus, readingStatusFilters } from '../../resources/js/lib/readingSheet.js';

test('switching status clears the previous status while retaining location filters', () => {
    const filters = { meter_box_id: '42', tariff_id: '3', entry: 'missing', approval: '' };
    const pending = { ...filters, ...readingStatusFilters('pending') };
    assert.deepEqual(pending, { meter_box_id: '42', tariff_id: '3', entry: '', approval: 'pending' });
    assert.equal(activeReadingStatus(pending), 'pending');
    const approved = { ...pending, ...readingStatusFilters('approved') };
    assert.equal(activeReadingStatus(approved), 'approved');
    const missing = { ...approved, ...readingStatusFilters('missing') };
    assert.equal(missing.approval, '');
    assert.equal(activeReadingStatus(missing), 'missing');
    assert.equal(activeReadingStatus({ ...missing, ...readingStatusFilters('all') }), 'all');
});

test('custom legacy filters do not highlight a tab that misrepresents the results', () => {
    assert.equal(activeReadingStatus({ entry: 'entered' }), null);
    assert.equal(activeReadingStatus({ entry: 'missing', approval: 'approved' }), null);
    assert.equal(activeReadingStatus({ entry: 'entered', approval: 'pending' }), 'pending');
});
