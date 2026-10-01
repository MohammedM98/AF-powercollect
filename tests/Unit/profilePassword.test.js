import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passwordStrength } from '../../resources/js/lib/profilePassword.js';

test('empty and short passwords never receive the strongest rating', () => {
    assert.equal(passwordStrength('', '').score, 0);
    assert.ok(passwordStrength('a1!', 'old').score < 4);
});

test('strong passwords support Arabic and do not rate reused passwords as strongest', () => {
    assert.equal(passwordStrength('كلمةالمرور123!', 'old').score, 4);
    assert.ok(passwordStrength('كلمةالمرور123!', 'كلمةالمرور123!').score < 4);
});
