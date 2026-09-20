<?php

namespace App\Http\Controllers;

use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\StoreGovernorateRequest;
use App\Http\Requests\UpdateGovernorateRequest;
use App\Models\Area;
use App\Models\Governorate;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class GovernorateController extends Controller
{
    use FiltersDataTable;

    private const SORTABLE = ['name', 'created_at'];

    /**
     * Display a listing of the resource.
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
            'status' => session('status'),
            'filters' => $this->dataTableState($request, 'name'),
            'areas' => $this->areaOptions(),
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create(): InertiaResponse
    {
        $this->authorize('create', Governorate::class);

        return Inertia::render('Governorates/Create', [
            'areas' => $this->areaOptions(),
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(StoreGovernorateRequest $request): RedirectResponse
    {
        $data = $request->validated();
        $areaIds = $data['area_ids'] ?? [];
        unset($data['area_ids']);

        DB::transaction(function () use ($data, $areaIds) {
            $governorate = Governorate::create($data);

            Area::whereIn('id', $areaIds)->update(['governorate_id' => $governorate->id]);
        });

        return redirect()->route('governorates.index')->with('status', 'governorate-created');
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Governorate $governorate): InertiaResponse
    {
        $this->authorize('update', $governorate);

        return Inertia::render('Governorates/Edit', [
            'governorate' => $this->editableFields($governorate),
            'areas' => $this->areaOptions(),
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(UpdateGovernorateRequest $request, Governorate $governorate): RedirectResponse
    {
        $data = $request->validated();
        $areaIds = $data['area_ids'] ?? [];
        unset($data['area_ids']);

        DB::transaction(function () use ($data, $areaIds, $governorate) {
            $governorate->update($data);

            // Unassign areas that were this governorate's but are no longer
            // selected, then (re)assign the ones that are.
            Area::where('governorate_id', $governorate->id)->whereNotIn('id', $areaIds)->update(['governorate_id' => null]);
            Area::whereIn('id', $areaIds)->update(['governorate_id' => $governorate->id]);
        });

        return redirect()->route('governorates.index')->with('status', 'governorate-updated');
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
            'area_ids' => $governorate->areas()->pluck('id'),
        ];
    }

    /**
     * Every area, with the governorate it currently belongs to (if any) —
     * so the assignment checklist can show where an area would move from.
     *
     * @return \Illuminate\Support\Collection<int, array{id: int, name: string, governorateName: ?string}>
     */
    private function areaOptions(): \Illuminate\Support\Collection
    {
        return Area::with('governorate')->orderBy('name')->get()->map(fn (Area $area) => [
            'id' => $area->id,
            'name' => $area->name,
            'governorateName' => $area->governorate?->name,
        ]);
    }
}
