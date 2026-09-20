<?php

namespace App\Http\Controllers;

use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\StoreMeterBoxRequest;
use App\Http\Requests\UpdateMeterBoxRequest;
use App\Models\Area;
use App\Models\Branch;
use App\Models\MeterBox;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class MeterBoxController extends Controller
{
    use FiltersDataTable;

    private const SORTABLE = ['box_number', 'location', 'created_at'];

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', MeterBox::class);

        $actor = auth()->user();

        $query = MeterBox::query()
            ->when(! $actor->isSuperAdmin(), fn ($q) => $q->where('branch_id', $actor->branch_id))
            ->with(['branch', 'area']);
        $this->applyDataTableFilters($query, $request, ['box_number', 'location'], self::SORTABLE, 'box_number');

        $meterBoxes = $query->paginate($this->dataTablePerPage($request))
            ->withQueryString()
            ->through(fn (MeterBox $meterBox) => [
                ...$this->editableFields($meterBox),
                'branchName' => $meterBox->branch->name,
                'areaName' => $meterBox->area?->name,
            ]);

        return Inertia::render('MeterBoxes/Index', [
            'meterBoxes' => $meterBoxes,
            'status' => session('status'),
            'filters' => $this->dataTableState($request, 'box_number'),
            ...$this->formOptions(),
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create(): InertiaResponse
    {
        $this->authorize('create', MeterBox::class);

        return Inertia::render('MeterBoxes/Create', $this->formOptions());
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(StoreMeterBoxRequest $request): RedirectResponse
    {
        $actor = auth()->user();
        $data = $request->validated();

        if (! $actor->isSuperAdmin()) {
            $data['branch_id'] = $actor->branch_id;
        }

        MeterBox::create($data);

        return redirect()->route('meter-boxes.index')->with('status', 'meter-box-created');
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(MeterBox $meterBox): InertiaResponse
    {
        $this->authorize('update', $meterBox);

        return Inertia::render('MeterBoxes/Edit', [
            'meterBox' => $this->editableFields($meterBox),
            ...$this->formOptions(),
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(UpdateMeterBoxRequest $request, MeterBox $meterBox): RedirectResponse
    {
        $data = $request->validated();

        $meterBox->update($data);

        return redirect()->route('meter-boxes.index')->with('status', 'meter-box-updated');
    }

    /**
     * A meter box's editable fields — used both for the dedicated edit
     * page and for the edit modal's initial form data on the index page.
     *
     * @return array<string, mixed>
     */
    private function editableFields(MeterBox $meterBox): array
    {
        return [
            'id' => $meterBox->id,
            'box_number' => $meterBox->box_number,
            'branch_id' => $meterBox->branch_id,
            'area_id' => $meterBox->area_id,
            'location' => $meterBox->location,
        ];
    }

    /**
     * The branch options for the create/edit forms, and whether the actor
     * may choose the branch themselves.
     *
     * @return array{branches: \Illuminate\Support\Collection, canChooseBranch: bool, areas: \Illuminate\Support\Collection}
     */
    private function formOptions(): array
    {
        $actor = auth()->user();
        $canChooseBranch = $actor->isSuperAdmin();

        return [
            'branches' => $canChooseBranch ? Branch::orderBy('name')->get() : collect(),
            'canChooseBranch' => $canChooseBranch,
            'areas' => Area::orderBy('name')->get(),
        ];
    }
}
