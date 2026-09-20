<?php

namespace App\Http\Controllers;

use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\StoreBranchRequest;
use App\Http\Requests\UpdateBranchRequest;
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

        $query = Branch::query()->with('governorate');
        $this->applyDataTableFilters($query, $request, ['name', 'location', 'phone'], self::SORTABLE, 'name');

        $branches = $query->paginate($this->dataTablePerPage($request))->withQueryString();

        return Inertia::render('Branches/Index', [
            'branches' => $branches,
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
        $this->authorize('create', Branch::class);

        return Inertia::render('Branches/Create', [
            'governorates' => Governorate::orderBy('name')->get(),
        ]);
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
            'governorates' => Governorate::orderBy('name')->get(),
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
}
