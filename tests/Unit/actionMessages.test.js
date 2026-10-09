import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visitReturnsStatus } from '../../resources/js/lib/actionMessages.js';

test('a full visit returns the flashed status', () => {
    assert.equal(visitReturnsStatus({ only: [], except: [] }), true);
});

test('a partial reload that leaves the status out does not return it again', () => {
    assert.equal(visitReturnsStatus({ only: ['statement'], except: [] }), false);
    assert.equal(visitReturnsStatus({ only: [], except: ['status'] }), false);
    assert.equal(visitReturnsStatus({ only: ['statement', 'status'], except: [] }), true);
});

test('the notices other people send, like a statement arriving for audit, have a message under the bell', async () => {
    const { ACTION_MESSAGES } = await import('../../resources/js/lib/actionMessages.js');

    assert.match(ACTION_MESSAGES['audit-statement-submitted'], /كشف/);
    assert.match(ACTION_MESSAGES['meter-reading-needs-reapproval'], /إعادة اعتماد/);
});
