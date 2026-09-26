import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../../resources/js/lib/csv.js';

test('cells with commas, quotes or line breaks are quoted', () => {
    assert.equal(csvCell('فرع العشار'), 'فرع العشار');
    assert.equal(csvCell('a,b'), '"a,b"');
    assert.equal(csvCell('قال "نعم"'), '"قال ""نعم"""');
    assert.equal(csvCell('سطر\nثاني'), '"سطر\nثاني"');
    assert.equal(csvCell(null), '');
});

test('typed text that starts like a formula is shown, not run; numbers stay numbers', () => {
    assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
    assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
    assert.equal(csvCell('-5'), "'-5");
    assert.equal(csvCell(-5), '-5');
});

test('a sheet starts with the byte order mark Excel needs for Arabic', () => {
    assert.equal(
        toCsv([
            ['الاسم', 'الرصيد'],
            ['أحمد', 12.5],
        ]),
        '﻿الاسم,الرصيد\r\nأحمد,12.5\r\n',
    );
});
