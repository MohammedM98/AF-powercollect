<?php

namespace App\Http\Controllers;

use App\Enums\TariffCategory;
use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\StoreTariffRequest;
use App\Http\Requests\UpdateTariffRequest;
use App\Models\Tariff;
use App\Models\TariffSegment;
use App\Models\User;
use App\Notifications\ActionCompleted;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class TariffController extends Controller
{
    use FiltersDataTable;

    private const SORTABLE = ['category', 'rate'];

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', Tariff::class);

        $actor = $request->user();
        $query = Tariff::query();
        $this->applyDataTableFilters($query, $request, [], self::SORTABLE, 'category');
        $this->applyDataTableFilterSelects($query, $request, ['category']);

        $tariffs = $query->paginate($this->dataTablePerPage($request))
            ->withQueryString()
            ->through(fn (Tariff $tariff) => [
                ...$this->editableFields($tariff),
                'categoryLabel' => __($tariff->category->label()),
                'canUpdate' => $actor->can('update', $tariff),
            ]);

        return Inertia::render('Tariffs/Index', [
            'tariffs' => $tariffs,
            'segmentGroups' => $this->segmentGroups($actor),
            'canCreate' => $actor->can('create', Tariff::class),
            'canCreateSegment' => $actor->can('create', TariffSegment::class),
            'filters' => $this->dataTableState($request, 'category'),
            'categoryOptions' => TariffCategory::options(),
            'filterOptions' => [
                $this->filterGroup('category', 'الفئة', TariffCategory::options()),
            ],
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create(): InertiaResponse
    {
        $this->authorize('create', Tariff::class);

        return Inertia::render('Tariffs/Create', [
            'categoryOptions' => TariffCategory::options(),
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(StoreTariffRequest $request): RedirectResponse
    {
        $tariff = Tariff::create($request->validated());
        $request->user()->notify(new ActionCompleted('tariff-created', __($tariff->category->label())));

        return redirect()->route('tariffs.index')->with('status', 'tariff-created');
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Tariff $tariff): InertiaResponse
    {
        $this->authorize('update', $tariff);

        return Inertia::render('Tariffs/Edit', [
            'tariff' => $this->editableFields($tariff),
            'categoryOptions' => TariffCategory::options(),
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(UpdateTariffRequest $request, Tariff $tariff): RedirectResponse
    {
        $tariff->update($request->validated());
        $request->user()->notify(new ActionCompleted('tariff-updated', __($tariff->category->label())));

        return redirect()->route('tariffs.index')->with('status', 'tariff-updated');
    }

    /**
     * Every tariff with its customer segments and how many subscribers
     * each has, for the segments panel on the index page.
     *
     * @return array<int, array{id: int, categoryLabel: string, segments: array<int, array{id: int, tariff_id: int, name: string, subscribersCount: int, canUpdate: bool}>}>
     */
    private function segmentGroups(User $actor): array
    {
        return Tariff::query()
            ->with(['segments' => fn ($query) => $query->withCount('subscribers')])
            ->orderBy('category')
            ->get()
            ->map(fn (Tariff $tariff) => [
                'id' => $tariff->id,
                'categoryLabel' => __($tariff->category->label()),
                'segments' => $tariff->segments->map(fn (TariffSegment $segment) => [
                    'id' => $segment->id,
                    'tariff_id' => $segment->tariff_id,
                    'name' => $segment->name,
                    'subscribersCount' => $segment->subscribers_count,
                    'canUpdate' => $actor->can('update', $segment),
                ])->all(),
            ])
            ->all();
    }

    /**
     * A tariff's editable fields — used both for the dedicated edit page
     * and for the edit modal's initial form data on the index page.
     *
     * @return array<string, mixed>
     */
    private function editableFields(Tariff $tariff): array
    {
        return [
            'id' => $tariff->id,
            'category' => $tariff->category->value,
            'rate' => $tariff->rate,
        ];
    }
}
