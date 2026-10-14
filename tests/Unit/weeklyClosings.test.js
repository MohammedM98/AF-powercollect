import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklyProgress, weeklyStepStates } from '../../resources/js/lib/weeklyClosings.js';

test('the steps before the one a week waits on are done and those after it are still to come', () => {
    assert.deepEqual(weeklyStepStates('confirm').map((step) => step.state), ['done', 'current', 'upcoming', 'upcoming']);
    assert.deepEqual(weeklyStepStates('audit').map((step) => step.state), ['done', 'done', 'current', 'upcoming']);
    assert.equal(weeklyProgress('review'), 0);
    assert.equal(weeklyProgress('audit'), 50);
});

test('once audit answered, every step is done', () => {
    assert.ok(weeklyStepStates('answered').every((step) => step.state === 'done'));
    assert.equal(weeklyProgress('answered'), 100);
});
