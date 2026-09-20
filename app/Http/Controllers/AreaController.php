<?php

namespace App\Http\Controllers;

use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\StoreAreaRequest;
use App\Http\Requests\UpdateAreaRequest;
use App\Models\Area;
use App\Models\Governorate;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class AreaController extends Controller
{
    use FiltersDataTable;

    private const SORTABLE = ['name', 'created_at'];

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', Area::class);

        $query = Area::query()->with('governorate');
        $this->applyDataTableFilters($query, $request, ['name'], self::SORTABLE, 'name');

        $areas = $query->paginate($this->dataTablePerPage($request))
            ->withQueryString()
            ->through(fn (Area $area) => [
                ...$this->editableFields($area),
                'governorateName' => $area->governorate?->name,
            ]);

        return Inertia::render('Areas/Index', [
            'areas' => $areas,
            'status' => session('status'),
            'filters' => $this->dataTableState($request, 'name'),
            'governorates' => Governorate::orderBy('name')->get(),
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create(): InertiaResponse
    {
        $this->authorize('create', Area::class);

        return Inertia::render('Areas/Create', [
            'governorates' => Governorate::orderBy('name')->get(),
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(StoreAreaRequest $request): RedirectResponse
    {
        Area::create($request->validated());

        return redirect()->route('areas.index')->with('status', 'area-created');
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Area $area): InertiaResponse
    {
        $this->authorize('update', $area);

        return Inertia::render('Areas/Edit', [
            'area' => $this->editableFields($area),
            'governorates' => Governorate::orderBy('name')->get(),
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(UpdateAreaRequest $request, Area $area): RedirectResponse
    {
        $area->update($request->validated());

        return redirect()->route('areas.index')->with('status', 'area-updated');
    }

    /**
     * An area's editable fields — used both for the dedicated edit page
     * and for the edit modal's initial form data on the index page.
     *
     * @return array<string, mixed>
     */
    private function editableFields(Area $area): array
    {
        return [
            'id' => $area->id,
            'name' => $area->name,
            'governorate_id' => $area->governorate_id,
        ];
    }
}
