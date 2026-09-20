<?php

namespace App\Http\Controllers;

use App\Enums\TariffCategory;
use App\Http\Requests\StoreTariffRequest;
use App\Http\Requests\UpdateTariffRequest;
use App\Models\Tariff;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class TariffController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(): InertiaResponse
    {
        $this->authorize('viewAny', Tariff::class);

        $tariffs = Tariff::orderBy('category')
            ->paginate(15)
            ->through(fn (Tariff $tariff) => [
                ...$this->editableFields($tariff),
                'categoryLabel' => __($tariff->category->label()),
            ]);

        return Inertia::render('Tariffs/Index', [
            'tariffs' => $tariffs,
            'status' => session('status'),
            'categoryOptions' => $this->categoryOptions(),
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create(): InertiaResponse
    {
        $this->authorize('create', Tariff::class);

        return Inertia::render('Tariffs/Create', [
            'categoryOptions' => $this->categoryOptions(),
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(StoreTariffRequest $request): RedirectResponse
    {
        Tariff::create($request->validated());

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
            'categoryOptions' => $this->categoryOptions(),
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(UpdateTariffRequest $request, Tariff $tariff): RedirectResponse
    {
        $tariff->update($request->validated());

        return redirect()->route('tariffs.index')->with('status', 'tariff-updated');
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

    /**
     * @return \Illuminate\Support\Collection<int, array{value: string, label: string}>
     */
    private function categoryOptions(): \Illuminate\Support\Collection
    {
        return collect(TariffCategory::cases())->map(fn (TariffCategory $category) => [
            'value' => $category->value,
            'label' => __($category->label()),
        ]);
    }
}
