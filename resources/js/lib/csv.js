/**
 * One spreadsheet cell. Text that starts like a formula (= + - @) gets an
 * apostrophe so Excel shows it instead of running it; numbers are left as
 * they are. Cells with commas, quotes or line breaks are quoted.
 */
export function csvCell(value) {
    let text = value === null || value === undefined ? '' : String(value);

    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) {
        text = `'${text}`;
    }

    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Rows as a CSV that Excel opens with Arabic intact: UTF-8 with a byte
 * order mark, one line per row.
 */
export function toCsv(rows) {
    return `﻿${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** Saves rows as a CSV file in the browser, e.g. the subscribers picked in a table. */
export function downloadCsv(filename, rows) {
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: filename });

    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
