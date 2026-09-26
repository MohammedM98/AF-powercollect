<?php

namespace App\Http\Concerns;

use App\Models\Branch;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/**
 * Adds search, sort, filter, and adjustable page-size support to an index
 * query, plus helpers for building the Filter menu's dropdowns — shared
 * across every list page's controller.
 */
trait FiltersDataTable
{
    /**
     * The page sizes a visitor may pick from.
     */
    private const PAGE_SIZES = [15, 25, 50, 100];

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
        $search = $this->searchTerm($request);

        if ($search !== '' && $searchableColumns !== []) {
            $query->where(function (Builder $inner) use ($search, $searchableColumns) {
                foreach ($searchableColumns as $column) {
                    $inner->orWhere($column, 'like', '%'.$search.'%');
                }
            });
        }

        $sort = $this->queryText($request, 'sort');

        if (in_array($sort, $sortableColumns, true)) {
            $query->orderBy($sort, $this->sortDirection($request));
        } else {
            $query->orderBy($defaultSort, $defaultDirection);
        }

        return $query;
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

    /**
     * The validated page size, restricted to a fixed allow-list.
     */
    protected function dataTablePerPage(Request $request, int $default = 15): int
    {
        $perPage = (int) $request->input('per_page', $default);

        return in_array($perPage, self::PAGE_SIZES, true) ? $perPage : $default;
    }

    /**
     * The current filter state, echoed back to the page so the search box,
     * sort indicators, and page-size selector stay in sync with the URL.
     *
     * @return array{search: string, sort: string, direction: string, per_page: int, filter: array<string, string>}
     */
    protected function dataTableState(Request $request, string $defaultSort, string $defaultDirection = 'asc', int $defaultPerPage = 15): array
    {
        $sort = $this->queryText($request, 'sort');

        return [
            'search' => $this->searchTerm($request),
            'sort' => $sort !== '' ? $sort : $defaultSort,
            'direction' => $sort !== '' ? $this->sortDirection($request) : $defaultDirection,
            'per_page' => $this->dataTablePerPage($request, $defaultPerPage),
            'filter' => (array) $request->input('filter', []),
        ];
    }

    /**
     * One dropdown in the table's Filter menu. `$key` is the column (or
     * custom filter name) sent back as `?filter[key]=value`.
     *
     * @param  iterable<int, array{value: string, label: string}>  $options
     * @return array{key: string, label: string, options: array<int, array{value: string, label: string}>}
     */
    protected function filterGroup(string $key, string $label, iterable $options): array
    {
        return [
            'key' => $key,
            'label' => $label,
            'options' => collect($options)->values()->all(),
        ];
    }

    /**
     * Models as dropdown options: the id as the value, and the given
     * attribute — or whatever the callback returns — as the label.
     *
     * @param  iterable<int, Model>  $models
     * @param  string|Closure(Model): string  $label
     * @return array<int, array{value: string, label: string}>
     */
    protected function modelOptions(iterable $models, string|Closure $label = 'name'): array
    {
        return collect($models)
            ->map(fn (Model $model) => [
                'value' => (string) $model->getKey(),
                'label' => $label instanceof Closure ? $label($model) : $model->{$label},
            ])
            ->values()
            ->all();
    }

    /**
     * The "Branch" dropdown — every branch, by name.
     *
     * @return array{key: string, label: string, options: array<int, array{value: string, label: string}>}
     */
    protected function branchFilterGroup(): array
    {
        return $this->filterGroup('branch_id', 'الفرع', $this->modelOptions(Branch::orderBy('name')->get()));
    }

    /**
     * The "Status" dropdown for an `is_active` column.
     *
     * @return array{key: string, label: string, options: array<int, array{value: string, label: string}>}
     */
    protected function activeStatusFilterGroup(): array
    {
        return $this->filterGroup('is_active', 'الحالة', [
            ['value' => '1', 'label' => 'نشط'],
            ['value' => '0', 'label' => 'متوقف'],
        ]);
    }

    /**
     * A text query parameter, trimmed — or '' when it is missing or not a
     * plain value (e.g. a hand-typed `?search[]=x`), so a malformed URL
     * shows the unfiltered list instead of an error.
     */
    protected function queryText(Request $request, string $key): string
    {
        $value = $request->input($key);

        return is_scalar($value) ? trim((string) $value) : '';
    }

    private function searchTerm(Request $request): string
    {
        return $this->queryText($request, 'search');
    }

    private function sortDirection(Request $request): string
    {
        return strtolower($this->queryText($request, 'direction')) === 'desc' ? 'desc' : 'asc';
    }
}
