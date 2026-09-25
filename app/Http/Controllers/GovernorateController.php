<?php

namespace App\Http\Controllers;

use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\StoreGovernorateRequest;
use App\Http\Requests\UpdateGovernorateRequest;
use App\Models\Area;
use App\Models\Governorate;
use App\Models\SubArea;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class GovernorateController extends Controller
{
    use FiltersDataTable;

    private const SORTABLE = ['name', 'created_at'];

    /**
     * Display a listing of the resource, plus the selected governorate's
     * areas (?selected=<id>) so the whole governorate/area hierarchy can
     * be managed from this one page.
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', Governorate::class);

        $query = Governorate::query()->withCount('areas');
        $this->applyDataTableFilters($query, $request, ['name'], self::SORTABLE, 'name');

        $governorates = $query->paginate($this->dataTablePerPage($request))
            ->withQueryString()
            ->through(fn (Governorate $governorate) => [
                ...$this->editableFields($governorate),
                'areasCount' => $governorate->areas_count,
            ]);

        return Inertia::render('Governorates/Index', [
            'governorates' => $governorates,
            'selectedGovernorate' => $this->selectedGovernorate($request),
            'selectedArea' => $this->selectedArea($request),
            'filters' => $this->dataTableState($request, 'name'),
            'governorateOptions' => Governorate::orderBy('name')->get(),
            'areaOptions' => Area::orderBy('name')->get(),
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create(): InertiaResponse
    {
        $this->authorize('create', Governorate::class);

        return Inertia::render('Governorates/Create');
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(StoreGovernorateRequest $request): RedirectResponse
    {
        $governorate = Governorate::create($request->validated());

        return redirect()->route('governorates.index', ['selected' => $governorate->id])->with('status', 'governorate-created');
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Governorate $governorate): InertiaResponse
    {
        $this->authorize('update', $governorate);

        return Inertia::render('Governorates/Edit', [
            'governorate' => $this->editableFields($governorate),
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(UpdateGovernorateRequest $request, Governorate $governorate): RedirectResponse
    {
        $governorate->update($request->validated());

        return redirect()->route('governorates.index', ['selected' => $governorate->id])->with('status', 'governorate-updated');
    }

    /**
     * A governorate's editable fields — used both for the dedicated edit
     * page and for the edit modal's initial form data on the index page.
     *
     * @return array<string, mixed>
     */
    private function editableFields(Governorate $governorate): array
    {
        return [
            'id' => $governorate->id,
            'name' => $governorate->name,
        ];
    }

    /**
     * The governorate named by the `selected` query param, with its areas
     * — the right-hand panel's data on the combined governorates/areas
     * page. Null when nothing is selected (or the id no longer exists).
     *
     * @return array{id: int, name: string, areas: Collection}|null
     */
    private function selectedGovernorate(Request $request): ?array
    {
        $selectedId = $request->integer('selected');

        if (! $selectedId) {
            return null;
        }

        $governorate = Governorate::with(['areas' => fn ($query) => $query->orderBy('name')])->find($selectedId);

        if (! $governorate) {
            return null;
        }

        return [
            'id' => $governorate->id,
            'name' => $governorate->name,
            'areas' => $governorate->areas->map(fn (Area $area) => [
                'id' => $area->id,
                'name' => $area->name,
                'governorate_id' => $area->governorate_id,
            ]),
        ];
    }

    /**
     * The area named by the `selectedArea` query param, with its sub-areas
     * — the third panel's data on the combined governorates/areas/sub-areas
     * page. Null when nothing is selected (or the id no longer exists).
     *
     * @return array{id: int, name: string, governorate_id: ?int, subAreas: Collection}|null
     */
    private function selectedArea(Request $request): ?array
    {
        $selectedId = $request->integer('selectedArea');

        if (! $selectedId) {
            return null;
        }

        $area = Area::with(['subAreas' => fn ($query) => $query->orderBy('name')])->find($selectedId);

        if (! $area) {
            return null;
        }

        return [
            'id' => $area->id,
            'name' => $area->name,
            'governorate_id' => $area->governorate_id,
            'subAreas' => $area->subAreas->map(fn (SubArea $subArea) => [
                'id' => $subArea->id,
                'name' => $subArea->name,
                'area_id' => $subArea->area_id,
            ]),
        ];
    }
}
