import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildWorkbookModel, defaultExcelSettings } from '../../resources/js/lib/excelSheet.js';
import { numberFormat, workbookBlob } from '../../resources/js/lib/excelWorkbook.js';

const lines = {
    key: 'lines',
    name: 'الحركات',
    columns: [
        { key: 'day', label: 'اليوم', type: 'date' },
        { key: 'name', label: 'المشترك' },
        { key: 'amount', label: 'المبلغ', type: 'money', sum: true },
    ],
    rows: [
        { day: '2026-10-01', name: 'سامي', amount: '10.50' },
        { day: '2026-10-02', name: '=HYPERLINK("http://x")', amount: '4' },
    ],
};

async function readBack(settings) {
    const blob = await workbookBlob(buildWorkbookModel([lines], settings, { lines: ['الفرع: مكتب البريج'], criteria: [['الفرع', 'مكتب البريج']] }), settings);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await blob.arrayBuffer()));

    return workbook;
}

test('the workbook reads right to left, its heading row frozen and filtered, its total a live formula', async () => {
    const settings = defaultExcelSettings([lines], { title: 'التقارير — مكتب البريج' });
    const workbook = await readBack(settings);
    const sheet = workbook.getWorksheet('الحركات');

    assert.deepEqual(workbook.worksheets.map((worksheet) => worksheet.name), ['الحركات', 'معايير التقرير']);
    assert.equal(sheet.views[0].rightToLeft, true);
    assert.equal(sheet.views[0].state, 'frozen');
    assert.equal(sheet.views[0].ySplit, 5);
    assert.equal(sheet.getCell('A1').value, 'التقارير — مكتب البريج');
    assert.equal(sheet.getCell('A5').value, 'اليوم');
    assert.equal(sheet.getCell('C6').value, 10.5);
    assert.equal(sheet.getCell('C6').numFmt, numberFormat('money', true));
    assert.ok(sheet.getCell('A6').value instanceof Date);
    assert.deepEqual(sheet.getCell('C8').value, { formula: 'SUBTOTAL(9,C6:C7)', result: 14.5 });
    assert.equal(sheet.autoFilter, 'A5:C7');
    assert.equal(sheet.pageSetup.printTitlesRow, '5:5');
});

test('text that looks like a formula stays text', async () => {
    const workbook = await readBack(defaultExcelSettings([lines]));

    assert.equal(workbook.getWorksheet('الحركات').getCell('B7').value, '=HYPERLINK("http://x")');
});

test('the user can turn the look off: left to right, nothing frozen, no symbol', async () => {
    const settings = { ...defaultExcelSettings([lines]), rtl: false, freeze: false, currency: false, criteria: false };
    const workbook = await readBack(settings);
    const sheet = workbook.getWorksheet('الحركات');

    assert.equal(workbook.worksheets.length, 1);
    assert.equal(sheet.views[0].rightToLeft, false);
    assert.notEqual(sheet.views[0].state, 'frozen');
    assert.equal(sheet.getCell('C6').numFmt, '#,##0.00;[Red]-#,##0.00');
});
