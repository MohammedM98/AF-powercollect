/**
 * Printing a list page. The toolbar's print button opens the same page in
 * a new tab with `print=1` in its address, keeping the page's search, sort
 * and filters, so the printout lists the rows in the order the table shows
 * them. With `print_all=1` the server sends every matching row instead of
 * one page (see App\Http\Concerns\FiltersDataTable::dataTablePerPage), and the
 * layout shows only the table, without the menus, then opens the
 * browser's print window.
 *
 * `print_cols` lists the columns to print by their position, `print_title`
 * is the heading above the table.
 */

const STORAGE_PREFIX = 'print-columns:';

/** The print settings in the current address, or null when the page isn't being printed. */
export function currentPrintSettings() {
    const params = new URLSearchParams(window.location.search);

    if (params.get('print') !== '1') {
        return null;
    }

    const columns = params.get('print_cols');

    return {
        title: params.get('print_title') ?? '',
        columns: columns === null || columns === '' ? null : columns.split(',').map(Number),
    };
}

/** Whether the current page is open for printing. */
export function isPrintMode() {
    return currentPrintSettings() !== null;
}

/**
 * The address of the printout: the current page with its search, sort and
 * filters. `allRows` prints every matching row from the first one; otherwise
 * only the page on screen.
 */
export function printUrl({ allRows, columns, title }) {
    const url = new URL(window.location.href);
    const params = url.searchParams;

    if (allRows) {
        params.delete('page');
        params.set('print_all', '1');
    } else {
        params.delete('print_all');
    }

    params.set('print', '1');
    params.set('print_cols', columns.join(','));
    params.set('print_title', title);

    return url.toString();
}

/**
 * The columns of the table that follows `element` (the toolbar): each
 * header's position and title. A column without a title (the row menu)
 * is left out, it has nothing to print.
 */
export function tableColumnsAfter(element) {
    const table = tableAfter(element);

    if (!table) {
        return [];
    }

    return [...table.querySelectorAll('thead tr:first-child > th')]
        .map((th, index) => ({ index, label: th.textContent.trim() }))
        .filter((column) => column.label !== '');
}

/** The first table after `element` among its following siblings. */
function tableAfter(element) {
    for (let sibling = element?.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
        const table = sibling.matches('table') ? sibling : sibling.querySelector('table');

        if (table) {
            return table;
        }
    }

    return null;
}

/** The columns picked last time on this page, or null when there's no saved choice. */
export function rememberedColumns(pageKey) {
    try {
        const saved = localStorage.getItem(STORAGE_PREFIX + pageKey);

        return saved ? JSON.parse(saved) : null;
    } catch {
        return null;
    }
}

/** Remember the picked column titles for the next printout of this page. */
export function rememberColumns(pageKey, labels) {
    try {
        localStorage.setItem(STORAGE_PREFIX + pageKey, JSON.stringify(labels));
    } catch {
        // Storage may be blocked (private mode); the choice still applies to this printout.
    }
}

/**
 * Hide every column of the page's tables that isn't in `columns` (by
 * position), plus any column without a title. A row whose cells don't
 * line up with the header (an empty-state or group row spanning the
 * table) is left as it is.
 */
export function hideUnprintedColumns(root, columns) {
    root.querySelectorAll('table').forEach((table) => {
        const headers = [...table.querySelectorAll('thead tr:first-child > th')];
        const hidden = new Set(
            headers
                .map((th, index) => ({ index, label: th.textContent.trim() }))
                .filter(({ index, label }) => label === '' || (columns !== null && !columns.includes(index)))
                .map(({ index }) => index),
        );

        table.querySelectorAll('tr').forEach((row) => {
            const cells = [...row.children];

            if (cells.length !== headers.length) {
                return;
            }

            cells.forEach((cell, index) => cell.classList.toggle('print-hidden', hidden.has(index)));
        });
    });
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
