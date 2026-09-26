import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initials } from '../../resources/js/lib/initials.js';

test('takes the first letters of the first two words, skipping a title', () => {
    assert.equal(initials("Ahmad O'Keefe"), 'AO');
    assert.equal(initials('Mrs. Ernestine Krajcik II'), 'EK');
    assert.equal(initials('karrada.admin'), 'KA');
});

test('uses one letter for a single word and nothing for an empty name', () => {
    assert.equal(initials('admin'), 'A');
    assert.equal(initials('  '), '');
    assert.equal(initials(null), '');
});
