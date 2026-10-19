import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bankAuditReasonChoice } from '../../resources/js/lib/bankAudit.js';

test('choosing missing in the note box sets the bank amount to zero and supplies its clarification', () => {
    const data = { bank_amount: '223', reason: '' };
    const chosen = bankAuditReasonChoice(data, 'missing');
    assert.deepEqual(chosen, { bank_amount: '0', reason: 'غير موجودة في البنك' });
    assert.deepEqual(data, { bank_amount: '223', reason: '' });
});

test('other clarifications preserve the amount actually entered by the auditor', () => {
    assert.deepEqual(bankAuditReasonChoice({ bank_amount: '173', reason: 'قديم' }, 'partial'), { bank_amount: '173', reason: 'وصل جزء من المبلغ' });
    assert.deepEqual(bankAuditReasonChoice({ bank_amount: '173', reason: 'توضيح خاص' }, ''), { bank_amount: '173', reason: 'توضيح خاص' });
    assert.deepEqual(bankAuditReasonChoice({ bank_amount: '173', reason: 'توضيح خاص' }, 'invalid'), { bank_amount: '173', reason: 'توضيح خاص' });
});
