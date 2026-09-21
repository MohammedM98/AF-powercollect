import { useEffect, useRef, useState } from 'react';
import { router } from '@inertiajs/react';

// Drives a server-backed data table: debounces the search box into a
// request, and issues immediate requests for sort/page-size changes.
// `filters` is the page's current filter state as echoed back by the
// controller (see App\Http\Concerns\FiltersDataTable), so sort/direction
// always reflect what the last response actually applied. `extraParams`
// are merged into every request unchanged — e.g. a `selected` id another
// part of the same page depends on, so it survives search/sort/page-size
// changes instead of being dropped.
export function useDataTable(url, filters, extraParams = {}) {
    const [search, setSearch] = useState(filters.search ?? '');
    const isFirstRun = useRef(true);

    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get(
                url,
                { ...extraParams, search, sort: filters.sort, direction: filters.direction, per_page: filters.per_page },
                { preserveState: true, preserveScroll: true, replace: true },
            );
        }, 350);

        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    function sort(column) {
        const direction = filters.sort === column && filters.direction === 'asc' ? 'desc' : 'asc';
        router.get(
            url,
            { ...extraParams, search, sort: column, direction, per_page: filters.per_page },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    }

    function setPerPage(perPage) {
        router.get(
            url,
            { ...extraParams, search, sort: filters.sort, direction: filters.direction, per_page: perPage },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    }

    return { search, setSearch, sort, setPerPage };
}
