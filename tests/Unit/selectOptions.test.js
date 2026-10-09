import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, Fragment } from 'react';
import { selectOptions } from '../../resources/js/lib/selectOptions.js';

test('custom menus preserve empty, numeric, nested and disabled native options', () => {
    const choices = [createElement('option', { key: 'empty', value: '' }, 'كل الحالات'), createElement(Fragment, { key: 'nested' }, createElement('option', { value: 0 }, 'صفر'), createElement('option', { value: 'pending', disabled: true }, 'بانتظار الاعتماد'))];
    assert.deepEqual(selectOptions(choices), [{ value: '', label: 'كل الحالات', disabled: false }, { value: '0', label: 'صفر', disabled: false }, { value: 'pending', label: 'بانتظار الاعتماد', disabled: true }]);
});

test('an option without an explicit value retains its text value', () => {
    assert.deepEqual(selectOptions(createElement('option', null, 'فرع ', 2)), [{ value: 'فرع 2', label: 'فرع 2', disabled: false }]);
});
