<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreSubAreaRequest;
use App\Http\Requests\UpdateSubAreaRequest;
use App\Models\Area;
use App\Models\SubArea;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class SubAreaController extends Controller
{
    /**
     * Show the form for creating a new resource.
     */
    public function create(): InertiaResponse
    {
        $this->authorize('create', SubArea::class);

        return Inertia::render('SubAreas/Create', [
            'areas' => Area::orderBy('name')->get(),
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(StoreSubAreaRequest $request): RedirectResponse
    {
        $subArea = SubArea::create($request->validated());

        return redirect()->route('governorates.index', array_filter([
            'selected' => $subArea->area?->governorate_id,
            'selectedArea' => $subArea->area_id,
        ]))->with('status', 'sub-area-created');
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(SubArea $subArea): InertiaResponse
    {
        $this->authorize('update', $subArea);

        return Inertia::render('SubAreas/Edit', [
            'subArea' => $this->editableFields($subArea),
            'areas' => Area::orderBy('name')->get(),
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(UpdateSubAreaRequest $request, SubArea $subArea): RedirectResponse
    {
        $subArea->update($request->validated());
        $subArea->refresh();

        return redirect()->route('governorates.index', array_filter([
            'selected' => $subArea->area?->governorate_id,
            'selectedArea' => $subArea->area_id,
        ]))->with('status', 'sub-area-updated');
    }

    /**
     * A sub-area's editable fields — used for the dedicated edit page and
     * for the edit modal's initial form data on the combined governorates
     * page.
     *
     * @return array<string, mixed>
     */
    private function editableFields(SubArea $subArea): array
    {
        return [
            'id' => $subArea->id,
            'name' => $subArea->name,
            'area_id' => $subArea->area_id,
        ];
    }
}
