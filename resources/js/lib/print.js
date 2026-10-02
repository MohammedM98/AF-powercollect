/**
 * Printing a list page. The toolbar's print button opens the same page in
 * a new tab with `print=1` in its address, keeping the page's search, sort
 * and filters, so the printout lists the rows in the order the table shows
 * them. There the layout swaps the page for the print designer
 * (Components/Print/PrintDesigner.jsx), which reads the page's table and
 * lets every part of the printout be set.
 *
 * With `print_all=1` the server sends every matching row instead of one
 * page (see App\Http\Concerns\FiltersDataTable::dataTablePerPage);
 * `print_page` keeps the page that was on screen, to switch back to it.
 * `print_title` is the heading to start from.
 */

/** The print settings in the current address, or null when the page isn't being printed. */
export function currentPrintSettings() {
    const params = new URLSearchParams(window.location.search);

    if (params.get('print') !== '1') {
        return null;
    }

    return {
        title: params.get('print_title') ?? '',
        allRows: params.get('print_all') === '1',
    };
}

/** Whether the current page is open for printing. */
export function isPrintMode() {
    return currentPrintSettings() !== null;
}

/**
 * The address of the printout of the current page, with its search, sort
 * and filters — every matching row from the first one.
 */
export function printUrl(title) {
    const url = new URL(window.location.href);
    const params = url.searchParams;

    params.set('print_page', params.get('page') ?? '1');
    params.delete('page');
    params.set('print', '1');
    params.set('print_all', '1');
    params.set('print_title', title);

    return url.toString();
}

/**
 * The printout's address with every matching row (`allRows`) or only the
 * page that was on screen.
 */
export function printScopeUrl(allRows) {
    const url = new URL(window.location.href);
    const params = url.searchParams;

    if (allRows) {
        params.delete('page');
        params.set('print_all', '1');
    } else {
        params.set('page', params.get('print_page') ?? '1');
        params.delete('print_all');
    }

    return url.toString();
}

/** A column's printed title: none for the row buttons' column (ActionsTh). */
function columnTitle(th) {
    return th.hasAttribute('data-actions') ? '' : th.textContent.trim();
}

/**
 * A cell's text as it reads on screen, line breaks included, plus the
 * value typed in any field in it (e.g. a reading being entered).
 */
function cellText(cell) {
    const fieldValues = [...cell.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select, textarea')]
        .map((field) => field.value)
        .filter((value) => value !== '');

    return [cell.innerText.trim(), ...fieldValues].filter(Boolean).join(' ').replace(/\n{2,}/g, '\n');
}

/**
 * The list's own table: the one after the table toolbar, else the first
 * table with column titles — not, say, a chart's hidden table of figures.
 */
function printedTable(root) {
    const afterToolbar = root?.querySelector('.data-table-toolbar ~ table, .data-table-toolbar ~ * table');

    if (afterToolbar) {
        return afterToolbar;
    }

    return [...(root?.querySelectorAll('table') ?? [])].find((table) => table.querySelector('thead th')?.textContent.trim()) ?? null;
}

/**
 * The list's table inside `root` as plain data: its columns (`{ key, label }`,
 * leaving out the row buttons' column) and its rows — `{ type: 'row',
 * cells }` with one text per column, or `{ type: 'group', text }` for a row
 * spanning the table (a day's heading, or the "no results" line). Column
 * keys are their titles, so a saved layout finds them again. `root` must
 * be laid out (not display: none) for the texts to keep their line breaks.
 */
export function extractTable(root) {
    const table = printedTable(root);

    if (!table) {
        return null;
    }

    const headers = [...table.querySelectorAll('thead tr:first-child > th')];
    const seen = new Map();
    const columns = headers
        .map((th, index) => {
            const label = columnTitle(th);
            const count = (seen.get(label) ?? 0) + 1;
            seen.set(label, count);

            return { index, label, key: count > 1 ? `${label} (${count})` : label };
        })
        .filter((column) => column.label !== '');

    const rows = [...table.querySelectorAll('tbody tr')]
        .map((row) => {
            const cells = [...row.children];

            if (cells.length === headers.length) {
                return { type: 'row', cells: Object.fromEntries(columns.map((column) => [column.key, cellText(cells[column.index])])) };
            }

            const text = row.innerText.trim();

            return text === '' ? null : { type: 'group', text };
        })
        .filter(Boolean);

    return { columns: columns.map(({ key, label }) => ({ key, label })), rows };
}

/** The page's summary under its table (e.g. the financial log's totals), if it has one. */
export function extractSummary(root) {
    // The readings sheet's footer also holds keyboard hints; only its first part is the total.
    const summary = root?.querySelector('.data-table-totals, .re-footer > :first-child');

    return summary ? summary.innerText.trim().replace(/\s*\n\s*/g, ' · ') : '';
}

/**
 * The page's paginated list among its props — the object with `data` rows
 * and a `total` — so the printout can say how many rows it holds.
 */
export function paginatedProp(props) {
    return Object.values(props ?? {}).find(
        (value) => value && typeof value === 'object' && Array.isArray(value.data) && typeof value.total === 'number',
    );
}
