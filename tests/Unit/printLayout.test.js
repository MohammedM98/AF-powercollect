import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellNumber, columnTotal, cssString, defaultLayout, fitLayout, moveColumn, pageCss } from '../../resources/js/lib/printLayout.js';

const columns = [
    { key: 'name', label: 'الاسم' },
    { key: 'box', label: 'رقم الطبلون' },
    { key: 'balance', label: 'الرصيد' },
];

test('a cell number is read with thousands separators, a minus sign and Arabic digits', () => {
    assert.equal(cellNumber('1,421.80 شيكل'), 1421.8);
    assert.equal(cellNumber('-45 شيكل'), -45);
    assert.equal(cellNumber('١٢٫٥'), 12.5);
    assert.equal(cellNumber('—'), null);
});

test('a dash inside a code is not read as a minus sign', () => {
    assert.equal(cellNumber('BOX-9597'), 9597);
});

test('a column total keeps the unit its cells share and two decimals only when needed', () => {
    assert.equal(columnTotal(['942.80 شيكل', '-45 شيكل', '—']), '897.80 شيكل');
    assert.equal(columnTotal(['10', '20']), '30');
    assert.equal(columnTotal(['10 شيكل', '5 كيلو']), '15');
    assert.equal(columnTotal(['—', '']), null);
});

test('a saved layout keeps its column order and names, drops removed columns and adds new ones at the end', () => {
    const fresh = defaultLayout({ columns, title: 'المشتركون' });
    const saved = {
        orientation: 'landscape',
        header: { title: 'كشف المشتركين' },
        columns: [
            { key: 'balance', label: 'المبلغ المستحق', visible: true, align: 'end', total: true },
            { key: 'gone', label: 'عمود قديم', visible: true },
            { key: 'name', label: 'الاسم', visible: false },
        ],
    };

    const layout = fitLayout(saved, fresh);

    assert.deepEqual(layout.columns.map((column) => column.key), ['balance', 'name', 'box']);
    assert.equal(layout.columns[0].label, 'المبلغ المستحق');
    assert.equal(layout.columns[0].total, true);
    assert.equal(layout.columns[1].visible, false);
    assert.equal(layout.columns[2].visible, true);
    assert.equal(layout.orientation, 'landscape');
    assert.equal(layout.header.title, 'كشف المشتركين');
    assert.equal(layout.header.logo, true);
});

test('a column moves one place and stays put at either end', () => {
    assert.deepEqual(moveColumn(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b']);
    assert.deepEqual(moveColumn(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']);
    assert.deepEqual(moveColumn(['a', 'b', 'c'], 2, 1), ['a', 'b', 'c']);
});

test('the printed page gets its paper, margins, page numbers, footer and repeated title', () => {
    const layout = defaultLayout({ columns, title: 'تقرير "خاص"' });
    layout.paper = 'A3';
    layout.orientation = 'landscape';
    layout.margin = 8;
    layout.footer.text = 'شركة الكهرباء';
    layout.header.repeatTitle = true;

    const css = pageCss(layout);

    assert.match(css, /size: A3 landscape; margin: 8mm;/);
    assert.match(css, /@bottom-left \{ content: "صفحة " counter\(page\) " من " counter\(pages\)/);
    assert.match(css, /@bottom-right \{ content: "شركة الكهرباء";/);
    assert.match(css, /@top-right \{ content: "تقرير \\"خاص\\"";/);
});

test('text placed in the page margin cannot close its CSS string', () => {
    assert.equal(cssString('a"} body { color: red'), '"a\\"} body { color: red"');
    assert.equal(cssString('back\\slash\nline'), '"back\\\\slash line"');
});
