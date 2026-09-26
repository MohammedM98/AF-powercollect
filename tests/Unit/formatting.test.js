import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAmount } from '../../resources/js/lib/currency.js';
import { formatClock, formatDayLabel, formatShortDay, timeAgo } from '../../resources/js/lib/dates.js';

test('amounts get thousands separators and fixed decimals', () => {
    assert.equal(formatAmount(12170), '12,170');
    assert.equal(formatAmount('1255', 2), '1,255.00');
    assert.equal(formatAmount(null), '0');
});

test('calendar days read in Arabic without shifting across time zones', () => {
    assert.equal(formatDayLabel('2026-09-26'), 'السبت، 26 أيلول');
    assert.equal(formatShortDay('2026-09-01'), '1 أيلول');
});

test('time ago picks minutes, hours or days and never says "in the future"', () => {
    const now = new Date('2026-09-26T12:00:00Z');

    assert.match(timeAgo('2026-09-26T11:59:50Z', now), /قبل/);
    assert.match(timeAgo('2026-09-26T07:00:00Z', now), /5 ساعات/);
    assert.match(timeAgo('2026-09-24T12:00:00Z', now), /يومين|2 يوم/);
    assert.match(timeAgo('2026-09-26T15:00:00Z', now), /قبل/);
    assert.equal(timeAgo(null, now), '—');
});

test('wall-clock times read as 12-hour Arabic times', () => {
    assert.equal(formatClock('17:05'), '5:05 م');
    assert.equal(formatClock('00:30'), '12:30 ص');
    assert.equal(formatClock('12:00'), '12:00 م');
});
