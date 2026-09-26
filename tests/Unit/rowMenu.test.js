import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECENT_TITLE, foldSearchText, itemForShortcut, matchRange, menuSections } from '../../resources/js/lib/rowMenu.js';

const groups = [
    {
        title: 'القراءات',
        items: [
            { key: 'readings', label: 'عرض القراءات', shortcut: 'V' },
            { key: 'new-reading', label: 'إدخال قراءة', shortcut: 'R', disabled: true },
        ],
    },
    {
        title: 'الحساب',
        items: [
            {
                key: 'statement',
                label: 'كشف الحساب',
                children: [
                    { key: 'statement-pdf', label: 'ملف PDF', shortcut: 'P' },
                    { key: 'statement-excel', label: 'ملف Excel', shortcut: 'E' },
                ],
            },
        ],
    },
    { title: 'فارغة', items: [] },
];

test('search folds hamza forms, ta marbuta and letter case without shifting positions', () => {
    assert.equal(foldSearchText('إدخال'), 'ادخال');
    assert.equal(foldSearchText('قراءة').length, 'قراءة'.length);
    assert.deepEqual(matchRange('إدخال قراءة', 'ادخال'), [0, 5]);
    assert.deepEqual(matchRange('ملف PDF', 'pdf'), [4, 7]);
    assert.equal(matchRange('ملف PDF', '  '), null);
    assert.equal(matchRange('ملف PDF', 'Excel'), null);
});

test('without a query the groups show in order, empty ones dropped, the last used action first', () => {
    assert.deepEqual(
        menuSections(groups).map((section) => section.title),
        ['القراءات', 'الحساب'],
    );

    const [recent] = menuSections(groups, '', 'statement-excel');
    assert.equal(recent.title, RECENT_TITLE);
    assert.deepEqual(
        recent.items.map((item) => item.key),
        ['statement-excel'],
    );
});

test('an action the user cannot use is never offered as the last used one', () => {
    assert.notEqual(menuSections(groups, '', 'new-reading')[0].title, RECENT_TITLE);
    assert.notEqual(menuSections(groups, '', 'missing')[0].title, RECENT_TITLE);
});

test('a query lists matching items, including a parent whose submenu matches', () => {
    const [results] = menuSections(groups, 'excel');

    assert.equal(results.title, 'نتائج "excel"');
    assert.deepEqual(
        results.items.map((item) => item.key),
        ['statement'],
    );
    assert.deepEqual(menuSections(groups, 'غير موجود'), []);
});

test('shortcuts go by the physical key and skip disabled items and submenu parents', () => {
    assert.equal(itemForShortcut(groups, 'KeyV').item.key, 'readings');
    assert.equal(itemForShortcut(groups, 'KeyP').item.key, 'statement-pdf');
    assert.equal(itemForShortcut(groups, 'KeyP').parent.key, 'statement');
    assert.equal(itemForShortcut(groups, 'KeyR'), null);
    assert.equal(itemForShortcut(groups, 'Digit1'), null);
});
