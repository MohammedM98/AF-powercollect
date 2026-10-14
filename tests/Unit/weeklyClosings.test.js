import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEEKLY_STEPS, weeklyProgress, weeklyStepStates } from '../../resources/js/lib/weeklyClosings.js';

test('the steps before the one a week waits on are done and those after it are still to come', () => {
    assert.deepEqual(weeklyStepStates('confirm').map((step) => step.state), ['done', 'done', 'current', 'upcoming', 'upcoming']);
    assert.deepEqual(weeklyStepStates('review').map((step) => step.state), ['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
});

test('a week audit accepted has every step done and is complete', () => {
    assert.ok(weeklyStepStates('done').every((step) => step.state === 'done'));
    assert.equal(weeklyProgress('done'), 100);
    assert.equal(weeklyProgress('review'), 0);
    assert.equal(weeklyProgress('audit'), Math.round((WEEKLY_STEPS.length - 1) / WEEKLY_STEPS.length * 100));
});
