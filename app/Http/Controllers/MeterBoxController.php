<?php

namespace App\Http\Controllers;

use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\StoreMeterBoxRequest;
use App\Http\Requests\UpdateMeterBoxRequest;
use App\Models\Area;
use App\Models\Branch;
use App\Models\Governorate;
use App\Models\MeterBox;
use App\Models\SubArea;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class MeterBoxController extends Controller
{
    use FiltersDataTable;

    private const SORTABLE = ['name', 'box_number', 'created_at'];

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', MeterBox::class);

        $actor = auth()->user();

        $query = MeterBox::query()->visibleTo($actor)->with('branch.governorate', 'branch.area', 'subArea');
        $this->applyDataTableFilters($query, $request, ['name', 'box_number'], self::SORTABLE, 'box_number');
        $this->applyDataTableFilterSelects($query, $request, ['branch_id', 'sub_area_id']);

        $meterBoxes = $query->paginate($this->dataTablePerPage($request))
            ->withQueryString()
            ->through(fn (MeterBox $meterBox) => [
                ...$this->editableFields($meterBox),
                'branchName' => $meterBox->branch->name,
                'governorateName' => $meterBox->branch->governorate?->name,
                'areaName' => $meterBox->branch->area?->name,
                'subAreaName' => $meterBox->subArea?->name,
            ]);

        return Inertia::render('MeterBoxes/Index', [
            'meterBoxes' => $meterBoxes,
            'filters' => $this->dataTableState($request, 'box_number'),
            'filterOptions' => $this->filterOptions($actor),
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
        $meterBox->update($request->validated());

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
            'name' => $meterBox->name,
            'box_number' => $meterBox->box_number,
            'branch_id' => $meterBox->branch_id,
            'sub_area_id' => $meterBox->sub_area_id,
            'location' => $meterBox->location,
        ];
    }

    /**
     * The branch options for the create/edit forms, and whether the actor
     * may choose the branch themselves. A Super Admin also gets every
     * governorate and area, purely to narrow down the branch picker with
     * a cascading select — a meter box's area/governorate always come
     * from whichever branch it belongs to, never stored on the meter box
     * itself. Everyone else has their branch forced server-side, so they
     * don't need any of this — except their own branch's area, so the
     * sub-area picker can still be scoped to it.
     *
     * @return array{branches: Collection, canChooseBranch: bool, governorates: Collection, areas: Collection, subAreas: Collection, currentBranchAreaId: ?int}
     */
    private function formOptions(): array
    {
        $actor = auth()->user();
        $canChooseBranch = $actor->isSuperAdmin();

        return [
            'branches' => $canChooseBranch ? Branch::with(['governorate', 'area'])->orderBy('name')->get() : collect(),
            'canChooseBranch' => $canChooseBranch,
            'governorates' => $canChooseBranch ? Governorate::orderBy('name')->get() : collect(),
            'areas' => $canChooseBranch ? Area::orderBy('name')->get() : collect(),
            'subAreas' => SubArea::orderBy('name')->get(),
            'currentBranchAreaId' => $canChooseBranch ? null : $actor->branch?->area_id,
        ];
    }

    /**
     * The Filter menu's dropdown groups for the index page. The branch
     * filter only makes sense for a Super Admin — everyone else's list is
     * already scoped to their own single branch.
     *
     * @return array<int, array{key: string, label: string, options: array<int, array{value: string, label: string}>}>
     */
    private function filterOptions(User $actor): array
    {
        $groups = [
            $this->filterGroup('sub_area_id', 'منطقة 2', $this->modelOptions(SubArea::visibleTo($actor)->orderBy('name')->get())),
        ];

        if ($actor->isSuperAdmin()) {
            $groups[] = $this->branchFilterGroup();
        }

        return $groups;
    }
}
