<?php

namespace App\Http\Concerns;

use App\Models\Branch;
use App\Models\MeterBox;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Expression;
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
     * The most rows a printout of every matching row holds.
     */
    public const PRINT_PAGE_SIZE = 2000;

    /**
     * Apply a `search` term (across the given columns) and a `sort` +
     * `direction` pair (restricted to the given allow-list) to the query.
     * A searchable column may be an expression, such as a subquery for a
     * related table's column.
     *
     * @param  array<int, string|Expression>  $searchableColumns
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

        $sort = (string) $request->string('sort');

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
     * The validated page size, restricted to a fixed allow-list. A printout
     * of every matching row (`?print_all=1`, see resources/js/lib/print.js)
     * gets them all on one page, up to PRINT_PAGE_SIZE.
     */
    protected function dataTablePerPage(Request $request, int $default = 15): int
    {
        if ($request->boolean('print_all')) {
            return self::PRINT_PAGE_SIZE;
        }

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
        $sort = (string) $request->string('sort');

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
     * Apply `?filter[meter_box_name]=…`: every subscriber on a box with
     * that name, whatever the box's suffix or number.
     */
    protected function applyMeterBoxNameFilter(Builder $query, Request $request): Builder
    {
        $name = ((array) $request->input('filter', []))['meter_box_name'] ?? null;

        if (is_string($name) && $name !== '') {
            $query->whereHas('meterBox', fn (Builder $box) => $box->where('name', $name));
        }

        return $query;
    }

    /**
     * The meter box filter as two linked dropdowns: the box name, then —
     * shown under it once a name is picked — that name's boxes by suffix
     * and number, e.g. "1 (1234)". Each box option names its `parent`, so
     * the page lists only the chosen name's boxes.
     *
     * @param  iterable<int, MeterBox>  $boxes
     * @param  (Closure(MeterBox): string)|null  $context  extra text after a box, e.g. its branch
     * @return array<int, array{key: string, label: string, options: array<int, array{value: string, label: string, parent?: string}>, dependsOn?: string}>
     */
    protected function meterBoxFilterGroups(iterable $boxes, ?Closure $context = null): array
    {
        $boxes = collect($boxes);
        $names = $boxes->pluck('name')->unique()->sort(SORT_NATURAL | SORT_FLAG_CASE)
            ->map(fn (string $name) => ['value' => $name, 'label' => $name]);
        $numbers = $boxes
            ->sortBy([['name_suffix', 'asc'], ['box_number', 'asc']], SORT_NATURAL)
            ->map(fn (MeterBox $box) => [
                'value' => (string) $box->getKey(),
                'label' => ltrim($box->name_suffix.' ('.$box->box_number.')').($context ? ' — '.$context($box) : ''),
                'parent' => $box->name,
            ]);

        return [
            $this->filterGroup('meter_box_name', 'الطبلون', $names),
            [...$this->filterGroup('meter_box_id', 'رقم الطبلون', $numbers), 'dependsOn' => 'meter_box_name'],
        ];
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

    private function searchTerm(Request $request): string
    {
        return trim((string) $request->string('search'));
    }

    private function sortDirection(Request $request): string
    {
        return $request->string('direction')->lower()->value() === 'desc' ? 'desc' : 'asc';
    }
}
