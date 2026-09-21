<?php

namespace App\Http\Concerns;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

/**
 * Adds search, sort, and adjustable page-size support to an index query,
 * shared across every list page's controller.
 */
trait FiltersDataTable
{
    /**
     * Apply a `search` term (across the given columns) and a `sort` +
     * `direction` pair (restricted to the given allow-list) to the query.
     *
     * @param  array<int, string>  $searchableColumns
     * @param  array<int, string>  $sortableColumns
     */
    protected function applyDataTableFilters(
        Builder $query,
        Request $request,
        array $searchableColumns,
        array $sortableColumns,
        string $defaultSort,
        string $defaultDirection = 'asc',
    ): Builder {
        $search = trim((string) $request->string('search'));

        if ($search !== '' && $searchableColumns !== []) {
            $query->where(function (Builder $inner) use ($search, $searchableColumns) {
                foreach ($searchableColumns as $column) {
                    $inner->orWhere($column, 'like', '%'.$search.'%');
                }
            });
        }

        $sort = (string) $request->string('sort');
        $direction = $request->string('direction')->lower()->value() === 'desc' ? 'desc' : 'asc';

        if (in_array($sort, $sortableColumns, true)) {
            $query->orderBy($sort, $direction);
        } else {
            $sort = $defaultSort;
            $direction = $defaultDirection;
            $query->orderBy($defaultSort, $defaultDirection);
        }

        return $query;
    }

    /**
     * The validated page size, restricted to a fixed allow-list.
     */
    protected function dataTablePerPage(Request $request, int $default = 15): int
    {
        $allowed = [15, 25, 50, 100];
        $perPage = (int) $request->input('per_page', $default);

        return in_array($perPage, $allowed, true) ? $perPage : $default;
    }

    /**
     * The current filter state, echoed back to the page so the search box,
     * sort indicators, and page-size selector stay in sync with the URL.
     *
     * @return array{search: string, sort: string, direction: string, per_page: int, filter: array<string, string>}
     */
    protected function dataTableState(Request $request, string $defaultSort, string $defaultDirection = 'asc', int $defaultPerPage = 15): array
    {
        $sort = (string) $request->string('sort');
        $direction = $request->string('direction')->lower()->value() === 'desc' ? 'desc' : 'asc';

        return [
            'search' => trim((string) $request->string('search')),
            'sort' => $sort !== '' ? $sort : $defaultSort,
            'direction' => $sort !== '' ? $direction : $defaultDirection,
            'per_page' => $this->dataTablePerPage($request, $defaultPerPage),
            'filter' => (array) $request->input('filter', []),
        ];
    }

    /**
     * Apply simple exact-match filters from `?filter[column]=value` — e.g. a
     * status or role dropdown in the table's Filter menu. Only columns
     * named in `$allowedColumns` are honored, so a client can't filter on
     * an arbitrary column. An empty/missing value for a column is a no-op.
     *
     * @param  array<int, string>  $allowedColumns
     */
    protected function applyDataTableFilterSelects(Builder $query, Request $request, array $allowedColumns): Builder
    {
        $filters = (array) $request->input('filter', []);

        foreach ($allowedColumns as $column) {
            $value = $filters[$column] ?? null;

            if ($value !== null && $value !== '') {
                $query->where($column, $value);
            }
        }

        return $query;
    }
}
