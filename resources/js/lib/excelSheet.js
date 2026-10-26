/**
 * The spreadsheets the Excel editor builds, as plain data: every part a
 * page can export is a table (`{ key, name, columns, rows, groupBys? }`,
 * each column `{ key, label, type, width, sum?, default? }`), and the
 * user's settings choose the parts, their columns and order, the title,
 * the totals and the look. The editor's preview and the .xlsx file are
 * both drawn from the model built here (lib/excelWorkbook.js writes it),
 * so what is previewed is what downloads.
 *
 * Column types: text, money (shekels), int, date (YYYY-MM-DD), time.
 */

/** "A", "B", … "Z", "AA": a column's letter in a sheet. */
export function columnLetter(index) {
    let letters = '';

    for (let number = index + 1; number > 0; number = Math.floor((number - 1) / 26)) {
        letters = String.fromCharCode(65 + ((number - 1) % 26)) + letters;
    }

    return letters;
}

/** How a part starts: shown, with its columns in their own order and the usual ones on. */
function defaultPart(part) {
    return { on: part.default !== false, columns: part.columns.map((column) => ({ key: column.key, on: column.default !== false })), groupBy: '' };
}

/** The settings an export starts from, before the user's own. */
export function defaultExcelSettings(parts, { title = '', fileName = 'export' } = {}) {
    return {
        title,
        fileName,
        header: true,
        totals: true,
        formulas: true,
        freeze: true,
        autofilter: true,
        rtl: true,
        zebra: true,
        currency: true,
        pageSetup: true,
        criteria: true,
        parts: Object.fromEntries(parts.map((part) => [part.key, defaultPart(part)])),
    };
}

/**
 * Settings saved earlier (a template, or the last export), fitted to the
 * parts as they are now: a part or column that no longer exists is left
 * out, one added since joins at the end, and the title and file name stay
 * this export's own.
 */
export function fitExcelSettings(saved, parts, defaults) {
    const fitted = { ...defaults, ...(saved ?? {}), title: defaults.title, fileName: defaults.fileName, parts: {} };

    for (const part of parts) {
        const fresh = defaults.parts[part.key];
        const old = saved?.parts?.[part.key];
        const known = new Set(part.columns.map((column) => column.key));
        const kept = (old?.columns ?? []).filter((column) => known.has(column.key));
        const keptKeys = new Set(kept.map((column) => column.key));

        fitted.parts[part.key] = {
            on: typeof old?.on === 'boolean' ? old.on : fresh.on,
            columns: [...kept, ...fresh.columns.filter((column) => !keptKeys.has(column.key))],
            groupBy: (part.groupBys ?? []).some((group) => group.key === old?.groupBy) ? old.groupBy : '',
        };
    }

    return fitted;
}

/** The part's columns the user kept, in their order. */
export function shownColumns(part, partSettings) {
    const byKey = new Map(part.columns.map((column) => [column.key, column]));

    return (partSettings?.columns ?? []).filter((column) => column.on && byKey.has(column.key)).map((column) => byKey.get(column.key));
}

/** A cell's value as a number for a number column (money arrives as text, "1234.50"). */
function cellValue(value, type) {
    if (value === null || value === undefined || value === '') {
        return '';
    }

    if (type === 'money' || type === 'int') {
        const number = Number(value);

        return Number.isFinite(number) ? number : '';
    }

    return value;
}

/**
 * One part as a sheet: the title and the lines under it (when the header
 * is on), the column headings, the rows — in groups with a subtotal each
 * when grouped — and a total row. Totals are SUBTOTAL formulas, so a
 * filter in Excel recounts them and a group's subtotal is never counted
 * twice; the value beside each formula is what Excel shows before it
 * recalculates.
 */
export function buildPartSheet(part, settings, meta = {}) {
    const partSettings = settings.parts[part.key];
    const columns = shownColumns(part, partSettings);
    const rows = [];
    const add = (kind, cells, extra = {}) => {
        rows.push({ kind, row: rows.length + 1, cells, ...extra });
        return rows.length;
    };

    if (settings.header) {
        add('title', [{ v: settings.title || part.name }]);
        add('subtitle', [{ v: part.name }]);
        (meta.lines ?? []).forEach((line) => add('meta', [{ v: line }]));
        add('blank', []);
    }

    const head = add('head', columns.map((column) => ({ v: column.label })));
    const sumCells = (from, to, label) => columns.map((column, index) => {
        if (column.sum) {
            const letter = columnLetter(index);

            return { v: 0, t: column.type, f: settings.formulas ? `SUBTOTAL(9,${letter}${from}:${letter}${to})` : null, from, to };
        }

        return { v: index === 0 ? label : '' };
    });
    const dataCells = (record) => columns.map((column) => ({ v: cellValue(record[column.key], column.type), t: column.type }));

    const group = (part.groupBys ?? []).find((candidate) => candidate.key === partSettings.groupBy);

    if (group) {
        const groups = new Map();
        part.rows.forEach((record) => {
            const value = record[group.key] ?? '';
            if (!groups.has(value)) groups.set(value, []);
            groups.get(value).push(record);
        });

        for (const [value, records] of groups) {
            add('group', [{ v: `${value || '—'} (${records.length})` }]);
            const first = rows.length + 1;
            records.forEach((record, index) => add('data', dataCells(record), { zebra: settings.zebra && index % 2 === 1 }));
            add('subtotal', sumCells(first, rows.length, `مجموع ${value || '—'}`));
        }
    } else {
        part.rows.forEach((record, index) => add('data', dataCells(record), { zebra: settings.zebra && index % 2 === 1 }));
    }

    const firstData = head + 1;
    const lastData = rows.length;

    if (settings.totals && part.rows.length > 0 && columns.some((column) => column.sum)) {
        add('total', sumCells(firstData, lastData, 'الإجمالي'));
    }

    // The value Excel shows beside each total before it recalculates: the sum of the data rows it covers.
    for (const row of rows) {
        if (row.kind !== 'subtotal' && row.kind !== 'total') continue;
        row.cells.forEach((cell, index) => {
            if (cell.from === undefined) return;
            cell.v = rows
                .filter((candidate) => candidate.kind === 'data' && candidate.row >= cell.from && candidate.row <= cell.to)
                .reduce((total, candidate) => total + (Number(candidate.cells[index].v) || 0), 0);
            cell.v = Math.round(cell.v * 100) / 100;
            delete cell.from;
            delete cell.to;
        });
    }

    return {
        key: part.key,
        name: part.name,
        columns,
        widths: columns.map((column) => column.width ?? 14),
        rows,
        head,
        firstData,
        lastData,
        grouped: Boolean(group),
        count: part.rows.length,
    };
}

/** The sheet that says what the file holds: the branch, the period and the filters, who made it and when, and each part's rows. */
export function buildCriteriaSheet(meta, sheets) {
    const rows = [];
    const add = (kind, cells) => rows.push({ kind, row: rows.length + 1, cells });

    add('title', [{ v: 'معايير التقرير' }]);
    add('blank', []);
    add('head', [{ v: 'البند' }, { v: 'القيمة' }]);
    (meta.criteria ?? []).forEach(([label, value]) => add('data', [{ v: label }, { v: value }]));
    sheets.forEach((sheet) => add('data', [{ v: `ورقة «${sheet.name}»` }, { v: `${sheet.count} صف` }]));

    return { key: 'criteria', name: 'معايير التقرير', columns: [{ key: 'label' }, { key: 'value' }], widths: [28, 60], rows, head: 3, firstData: 4, lastData: rows.length, grouped: false, count: rows.length - 3 };
}

/** Every sheet the file will hold, in the parts' order, then the criteria sheet when it is on. */
export function buildWorkbookModel(parts, settings, meta = {}) {
    const sheets = parts.filter((part) => settings.parts[part.key]?.on).map((part) => buildPartSheet(part, settings, meta));

    return settings.criteria && sheets.length > 0 ? [...sheets, buildCriteriaSheet(meta, sheets)] : sheets;
}

/** A cell as the preview shows it. */
export function formatExcelCell(value, type, currency = true) {
    if (value === '' || value === null || value === undefined) {
        return '';
    }

    if (type === 'money') {
        return `${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ' ₪' : ''}`;
    }

    if (type === 'int') {
        return Number(value).toLocaleString('en-US');
    }

    if (type === 'date' && /^\d{4}-\d{2}-\d{2}/.test(String(value))) {
        const [year, month, day] = String(value).slice(0, 10).split('-');

        return `${day}/${month}/${year}`;
    }

    return String(value);
}

/** "التقارير_مكتب-البريج_2026-10-01_2026-10-26.xlsx": a file name without the characters a file system refuses. */
export function excelFileName(name) {
    const clean = String(name || 'export').replace(/\.xlsx$/i, '').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');

    return `${clean}.xlsx`;
}
