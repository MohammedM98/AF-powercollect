<?php

namespace App\Http\Controllers;

use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\StoreBranchRequest;
use App\Http\Requests\UpdateBranchRequest;
use App\Models\Area;
use App\Models\Branch;
use App\Models\Governorate;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class BranchController extends Controller
{
    use FiltersDataTable;

    private const SORTABLE = ['name', 'location', 'phone', 'is_active', 'created_at'];

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', Branch::class);

        $query = Branch::query()->with(['governorate', 'area']);
        $this->applyDataTableFilters($query, $request, ['name', 'location', 'phone'], self::SORTABLE, 'name');
        $this->applyDataTableFilterSelects($query, $request, ['is_active', 'governorate_id']);

        $branches = $query->paginate($this->dataTablePerPage($request))->withQueryString();

        return Inertia::render('Branches/Index', [
            'branches' => $branches,
            'status' => session('status'),
            'filters' => $this->dataTableState($request, 'name'),
            'filterOptions' => $this->filterOptions(),
            ...$this->formOptions(),
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create(): InertiaResponse
    {
        $this->authorize('create', Branch::class);

        return Inertia::render('Branches/Create', $this->formOptions());
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(StoreBranchRequest $request): RedirectResponse
    {
        Branch::create($request->validated());

        return redirect()->route('branches.index')->with('status', 'branch-created');
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Branch $branch): InertiaResponse
    {
        $this->authorize('update', $branch);

        return Inertia::render('Branches/Edit', [
            'branch' => $branch,
            ...$this->formOptions(),
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(UpdateBranchRequest $request, Branch $branch): RedirectResponse
    {
        $branch->update($request->validated());

        return redirect()->route('branches.index')->with('status', 'branch-updated');
    }

    /**
     * The governorates and areas for the create/edit form. Areas are sent
     * unfiltered (each carrying its governorate_id) so the form can narrow
     * the area choices client-side once a governorate is picked.
     *
     * @return array{governorates: \Illuminate\Support\Collection, areas: \Illuminate\Support\Collection}
     */
    private function formOptions(): array
    {
        return [
            'governorates' => Governorate::orderBy('name')->get(),
            'areas' => Area::with('governorate')->orderBy('name')->get(),
        ];
    }

    /**
     * The Filter menu's dropdown groups for the index page.
     *
     * @return array<int, array{key: string, label: string, options: array<int, array{value: string, label: string}>}>
     */
    private function filterOptions(): array
    {
        return [
            [
                'key' => 'is_active',
                'label' => 'الحالة',
                'options' => [
                    ['value' => '1', 'label' => 'نشط'],
                    ['value' => '0', 'label' => 'متوقف'],
                ],
            ],
            [
                'key' => 'governorate_id',
                'label' => 'المحافظة',
                'options' => Governorate::orderBy('name')->get()->map(fn (Governorate $governorate) => [
                    'value' => (string) $governorate->id,
                    'label' => $governorate->name,
                ])->all(),
            ],
        ];
    }
}
