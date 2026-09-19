<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreBranchRequest;
use App\Http\Requests\UpdateBranchRequest;
use App\Models\Branch;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class BranchController extends Controller
{
    /**
     * Display a listing of the resource.
     *
     * Rendered with Inertia + React as a trial — every other view in the
     * app is still Blade. See BranchController only; nothing else changed.
     */
    public function index(): InertiaResponse
    {
        $this->authorize('viewAny', Branch::class);

        $branches = Branch::orderBy('name')->paginate(15);

        return Inertia::render('Branches/Index', [
            'branches' => $branches,
            'status' => session('status'),
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create(): View
    {
        $this->authorize('create', Branch::class);

        return view('branches.create');
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
    public function edit(Branch $branch): View
    {
        $this->authorize('update', $branch);

        return view('branches.edit', compact('branch'));
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
