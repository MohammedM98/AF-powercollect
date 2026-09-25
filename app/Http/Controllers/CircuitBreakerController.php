<?php

namespace App\Http\Controllers;

use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\StoreCircuitBreakerRequest;
use App\Http\Requests\UpdateCircuitBreakerRequest;
use App\Models\CircuitBreaker;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class CircuitBreakerController extends Controller
{
    use FiltersDataTable;

    private const SORTABLE = ['ampere', 'minimum_payment'];

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', CircuitBreaker::class);

        $query = CircuitBreaker::query();
        $this->applyDataTableFilters($query, $request, [], self::SORTABLE, 'ampere');
        $this->applyDataTableFilterSelects($query, $request, ['ampere']);

        $circuitBreakers = $query->paginate($this->dataTablePerPage($request))
            ->withQueryString()
            ->through(fn (CircuitBreaker $circuitBreaker) => $this->editableFields($circuitBreaker));

        return Inertia::render('CircuitBreakers/Index', [
            'circuitBreakers' => $circuitBreakers,
            'filters' => $this->dataTableState($request, 'ampere'),
            'filterOptions' => $this->filterOptions(),
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create(): InertiaResponse
    {
        $this->authorize('create', CircuitBreaker::class);

        return Inertia::render('CircuitBreakers/Create');
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(StoreCircuitBreakerRequest $request): RedirectResponse
    {
        CircuitBreaker::create($request->validated());

        return redirect()->route('circuit-breakers.index')->with('status', 'circuit-breaker-created');
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(CircuitBreaker $circuitBreaker): InertiaResponse
    {
        $this->authorize('update', $circuitBreaker);

        return Inertia::render('CircuitBreakers/Edit', [
            'circuitBreaker' => $this->editableFields($circuitBreaker),
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(UpdateCircuitBreakerRequest $request, CircuitBreaker $circuitBreaker): RedirectResponse
    {
        $circuitBreaker->update($request->validated());

        return redirect()->route('circuit-breakers.index')->with('status', 'circuit-breaker-updated');
    }

    /**
     * A circuit breaker's editable fields — used both for the dedicated
     * edit page and for the edit modal's initial form data on the index
     * page.
     *
     * @return array<string, mixed>
     */
    private function editableFields(CircuitBreaker $circuitBreaker): array
    {
        return [
            'id' => $circuitBreaker->id,
            'ampere' => $circuitBreaker->ampere,
            'minimum_payment' => $circuitBreaker->minimum_payment,
        ];
    }

    /**
     * The Filter menu's dropdown groups for the index page — every distinct
     * ampere value currently in use.
     *
     * @return array<int, array{key: string, label: string, options: array<int, array{value: string, label: string}>}>
     */
    private function filterOptions(): array
    {
        $amperes = CircuitBreaker::query()->distinct()->orderBy('ampere')->pluck('ampere');

        return [
            $this->filterGroup('ampere', 'الأمبير', $amperes->map(fn (int|string $ampere) => ['value' => (string) $ampere, 'label' => "{$ampere}A"])),
        ];
    }
}
