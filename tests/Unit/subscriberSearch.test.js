import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_SEARCH_LENGTH, isSearchable, moveActive, paletteItems, subscriberSearchUrl } from '../../resources/js/lib/subscriberSearch.js';

test('a search shorter than the minimum is not sent', () => {
    assert.equal(MIN_SEARCH_LENGTH, 2);
    assert.equal(isSearchable(''), false);
    assert.equal(isSearchable('   '), false);
    assert.equal(isSearchable(' ا '), false);
    assert.equal(isSearchable('اح'), true);
    assert.equal(isSearchable(undefined), false);
});

test('the search address carries the trimmed, encoded text', () => {
    assert.equal(subscriberSearchUrl('  Ahmad Nasser '), '/search/subscriptions?q=Ahmad+Nasser');
    assert.equal(new URL(subscriberSearchUrl('أحمد & علي'), 'http://x').searchParams.get('q'), 'أحمد & علي');
    assert.equal(new URL(subscriberSearchUrl('a&b=c'), 'http://x').searchParams.get('q'), 'a&b=c');
});

test('the palette lists the pages first and then the subscribers, each with its kind', () => {
    const items = paletteItems(
        [{ href: '/payments', label: 'تسجيل الدفعات' }, { href: '/ledger', label: 'السجل المالي' }],
        [{ id: 7, name: 'Samir', href: '/subscriptions?search=1' }],
    );

    assert.deepEqual(items.map((item) => [item.kind, item.key]), [
        ['page', 'page:/payments'],
        ['page', 'page:/ledger'],
        ['subscriber', 'subscriber:7'],
    ]);
    assert.equal(items[2].name, 'Samir');
});

test('a page and a subscriber never share a key, even when their ids and addresses look alike', () => {
    const items = paletteItems([{ href: '7' }], [{ id: 7 }]);

    assert.notEqual(items[0].key, items[1].key);
});

test('the arrow keys stop at either end of the list and ignore an empty one', () => {
    assert.equal(moveActive(0, -1, 3), 0);
    assert.equal(moveActive(0, 1, 3), 1);
    assert.equal(moveActive(2, 1, 3), 2);
    assert.equal(moveActive(5, 1, 3), 2);
    assert.equal(moveActive(0, 1, 0), -1);
});
