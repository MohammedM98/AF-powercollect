import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodLabel } from '../../resources/js/lib/closingPeriods.js';

const weekly = { frequency: 'weekly', week_starts_on: 6, cutoff_time: '00:00' };
// Gaza is UTC+3 in October: Saturday 10 October 00:00 there is 9 October 21:00 UTC.
const period = (from, until) => ({ coverage_from: from, coverage_until: until, workflow_settings: weekly });

test('a full week is named by its number', () => {
    assert.equal(periodLabel(period('2026-10-09T21:00:00Z', '2026-10-16T21:00:00Z')), 'الأسبوع 41');
});

test('a week closed early keeps its number, and what was left of it joins the next week under both numbers', () => {
    assert.equal(periodLabel(period('2026-10-09T21:00:00Z', '2026-10-14T09:00:00Z')), 'الأسبوع 41');
    assert.equal(periodLabel(period('2026-10-14T09:00:00Z', '2026-10-23T21:00:00Z')), 'تكملة الأسبوع 41 والأسبوع 42');
});

test('the rest of a week closed early within the same week, and a period running over several weeks, say so', () => {
    assert.equal(periodLabel(period('2026-10-16T15:03:32Z', '2026-10-16T15:06:26Z')), 'تكملة الأسبوع 41');
    assert.equal(periodLabel(period('2026-10-16T15:06:26Z', '2026-10-30T21:00:00Z')), 'تكملة الأسبوع 41 حتى الأسبوع 43');
});

test('a week ending at a cutoff in the evening counts up to that time', () => {
    const evening = { frequency: 'weekly', week_starts_on: 6, cutoff_time: '18:00' };
    assert.equal(periodLabel({ coverage_from: '2026-10-10T15:00:00Z', coverage_until: '2026-10-17T15:00:00Z', workflow_settings: evening }), 'الأسبوع 41');
});

test('a period without its weekly settings, a continuation and a daily period keep their names', () => {
    assert.equal(periodLabel({ coverage_from: '2026-10-09T21:00:00Z' }), 'الأسبوع 41');
    assert.equal(periodLabel({ coverage_from: '2026-10-09T21:00:00Z', workflow_settings: { continuation: true } }), 'تكملة الأسبوع');
    assert.equal(periodLabel(null), '—');
});
