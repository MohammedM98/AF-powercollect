import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildPartSheet,
    buildWorkbookModel,
    columnLetter,
    defaultExcelSettings,
    excelFileName,
    fitExcelSettings,
    formatExcelCell,
    shownColumns,
} from '../../resources/js/lib/excelSheet.js';

const lines = {
    key: 'lines',
    name: 'الحركات',
    columns: [
        { key: 'day', label: 'اليوم', type: 'date' },
        { key: 'collector', label: 'المحصّل', type: 'text' },
        { key: 'reference', label: 'المرجع', type: 'text', default: false },
        { key: 'amount', label: 'المبلغ', type: 'money', sum: true },
    ],
    groupBys: [{ key: 'collector', label: 'المحصّل' }],
    rows: [
        { day: '2026-10-01', collector: 'سامي', reference: 'A', amount: '10.50' },
        { day: '2026-10-01', collector: 'خالد', reference: 'B', amount: '20' },
        { day: '2026-10-02', collector: 'سامي', reference: 'C', amount: '5.25' },
    ],
};

const summary = { key: 'summary', name: 'الملخص', columns: [{ key: 'label', label: 'البند' }, { key: 'value', label: 'القيمة', type: 'money' }], rows: [{ label: 'التحميلات', value: '100' }] };

test('columns are lettered as Excel letters them', () => {
    assert.deepEqual([0, 1, 25, 26, 27, 51, 52].map(columnLetter), ['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA']);
});

test('a part starts with its usual columns on, in their order', () => {
    const settings = defaultExcelSettings([lines], { title: 'التقارير', fileName: 'report' });

    assert.deepEqual(shownColumns(lines, settings.parts.lines).map((column) => column.key), ['day', 'collector', 'amount']);
});

test('the rows are numbers where they add up, with a total that Excel recounts when filtered', () => {
    const settings = defaultExcelSettings([lines], { title: 'التقارير' });
    const sheet = buildPartSheet(lines, settings, { lines: ['الفرع: مكتب البريج'] });

    assert.deepEqual(sheet.rows.map((row) => row.kind), ['title', 'subtitle', 'meta', 'blank', 'head', 'data', 'data', 'data', 'total']);
    assert.equal(sheet.head, 5);
    assert.deepEqual(sheet.rows[5].cells.map((cell) => cell.v), ['2026-10-01', 'سامي', 10.5]);
    const total = sheet.rows.at(-1).cells;
    assert.equal(total[0].v, 'الإجمالي');
    assert.equal(total[2].f, 'SUBTOTAL(9,C6:C8)');
    assert.equal(total[2].v, 35.75);
});

test('grouped rows get a heading and a subtotal each, which the grand total does not count twice', () => {
    const settings = defaultExcelSettings([lines]);
    settings.header = false;
    settings.parts.lines.groupBy = 'collector';
    const sheet = buildPartSheet(lines, settings);

    assert.deepEqual(sheet.rows.map((row) => row.kind), ['head', 'group', 'data', 'data', 'subtotal', 'group', 'data', 'subtotal', 'total']);
    assert.equal(sheet.rows[1].cells[0].v, 'سامي (2)');
    assert.equal(sheet.rows[4].cells[2].f, 'SUBTOTAL(9,C3:C4)');
    assert.equal(sheet.rows[4].cells[2].v, 15.75);
    assert.equal(sheet.rows[7].cells[2].v, 20);
    assert.equal(sheet.rows[8].cells[2].f, 'SUBTOTAL(9,C2:C8)');
    assert.equal(sheet.rows[8].cells[2].v, 35.75);
});

test('hidden and moved columns follow the user, and without formulas the totals are plain numbers', () => {
    const settings = defaultExcelSettings([lines]);
    settings.header = false;
    settings.formulas = false;
    settings.parts.lines.columns = [
        { key: 'amount', on: true },
        { key: 'reference', on: true },
        { key: 'day', on: false },
        { key: 'collector', on: true },
    ];
    const sheet = buildPartSheet(lines, settings);

    assert.deepEqual(sheet.rows[0].cells.map((cell) => cell.v), ['المبلغ', 'المرجع', 'المحصّل']);
    assert.deepEqual(sheet.rows.at(-1).cells.map((cell) => [cell.v, cell.f ?? null]), [[35.75, null], ['', null], ['', null]]);
});

test('the workbook holds the parts turned on, then the criteria sheet', () => {
    const settings = defaultExcelSettings([summary, lines]);
    settings.parts.summary.on = false;
    const sheets = buildWorkbookModel([summary, lines], settings, { criteria: [['الفرع', 'مكتب البريج']] });

    assert.deepEqual(sheets.map((sheet) => sheet.name), ['الحركات', 'معايير التقرير']);
    assert.deepEqual(sheets[1].rows.slice(3).map((row) => row.cells.map((cell) => cell.v)), [['الفرع', 'مكتب البريج'], ['ورقة «الحركات»', '3 صف']]);
    settings.criteria = false;
    assert.equal(buildWorkbookModel([summary, lines], settings).length, 1);
});

test('saved settings fit the parts as they are now', () => {
    const defaults = defaultExcelSettings([lines], { title: 'جديد', fileName: 'new' });
    const saved = {
        title: 'قديم',
        zebra: false,
        parts: {
            lines: { on: true, columns: [{ key: 'amount', on: true }, { key: 'gone', on: true }, { key: 'day', on: false }], groupBy: 'missing' },
            old: { on: true, columns: [], groupBy: '' },
        },
    };
    const fitted = fitExcelSettings(saved, [lines], defaults);

    assert.equal(fitted.title, 'جديد');
    assert.equal(fitted.zebra, false);
    assert.deepEqual(Object.keys(fitted.parts), ['lines']);
    assert.deepEqual(fitted.parts.lines.columns.map((column) => `${column.key}:${column.on}`), ['amount:true', 'day:false', 'collector:true', 'reference:false']);
    assert.equal(fitted.parts.lines.groupBy, '');
});

test('cells read in the preview as they will in Excel', () => {
    assert.equal(formatExcelCell(1234.5, 'money'), '1,234.50 ₪');
    assert.equal(formatExcelCell(1234.5, 'money', false), '1,234.50');
    assert.equal(formatExcelCell('2026-10-26', 'date'), '26/10/2026');
    assert.equal(formatExcelCell('', 'money'), '');
});

test('file names keep Arabic and lose what a file system refuses', () => {
    assert.equal(excelFileName('التقارير_مكتب البريج: 2026/10'), 'التقارير_مكتب-البريج-2026-10.xlsx');
    assert.equal(excelFileName('report.xlsx'), 'report.xlsx');
});
