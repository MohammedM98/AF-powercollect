import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarDays, displayDate, inDateBounds, parseDateInput, shiftMonth } from '../../resources/js/lib/datePicker.js';

test('manual dates and datetimes keep the submitted ISO format and local time', () => {
    assert.equal(parseDateInput('09/10/2026'), '2026-10-09');
    assert.equal(parseDateInput('2026-10-09'), '2026-10-09');
    assert.equal(parseDateInput('09/10/2026 13:45', 'datetime-local'), '2026-10-09T13:45');
    assert.equal(parseDateInput('2026-10-09T13:45:30', 'datetime-local'), '2026-10-09T13:45:30');
    assert.equal(displayDate('2026-10-09T13:45'), '09/10/2026 13:45');
    assert.equal(parseDateInput(''), '');
});

test('impossible dates and times are rejected rather than rolled into another month', () => {
    assert.equal(parseDateInput('29/02/2024'), '2024-02-29');
    for (const value of ['29/02/2026', '31/04/2026', '00/10/2026', '09/13/2026', '2026-1-9', '0000-01-01']) assert.equal(parseDateInput(value), null);
    for (const value of ['2026-10-09T24:00', '2026-10-09T13:60', '2026-10-09T13:00:60']) assert.equal(parseDateInput(value, 'datetime-local'), null);
});

test('date boundaries include the permitted endpoints and compare datetime time too', () => {
    assert.equal(inDateBounds('2026-10-09', '2026-10-09', '2026-10-09'), true);
    assert.equal(inDateBounds('2026-10-08', '2026-10-09'), false);
    assert.equal(inDateBounds('2026-10-10', null, '2026-10-09'), false);
    assert.equal(inDateBounds('2026-10-09T13:45', '2026-10-09T14:00'), false);
});

test('calendar navigation crosses years and includes leap days without timezone shifts', () => {
    assert.equal(shiftMonth('2026-12', 1), '2027-01');
    assert.equal(shiftMonth('2026-01', -1), '2025-12');
    const days = calendarDays('2024-02');
    assert.equal(days.length, 42);
    assert.equal(days[0], '2024-01-28');
    assert.ok(days.includes('2024-02-29'));
    assert.equal(days.at(-1), '2024-03-09');
});
