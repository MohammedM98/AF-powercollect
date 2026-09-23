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
            'status' => session('status'),
            'filters' => $this->dataTableState($request, 'ampere'),
            'filterOptions' => $this->filterOptions(),
        ]);
    }

    public function create(): InertiaResponse
    {
        $this->authorize('create', CircuitBreaker::class);

        return Inertia::render('CircuitBreakers/Create');
    }

    public function store(StoreCircuitBreakerRequest $request): RedirectResponse
    {
        CircuitBreaker::create($request->validated());

        return redirect()->route('circuit-breakers.index')->with('status', 'circuit-breaker-created');
    }

    public function edit(CircuitBreaker $circuitBreaker): InertiaResponse
    {
        $this->authorize('update', $circuitBreaker);

        return Inertia::render('CircuitBreakers/Edit', [
            'circuitBreaker' => $this->editableFields($circuitBreaker),
        ]);
    }

    public function update(UpdateCircuitBreakerRequest $request, CircuitBreaker $circuitBreaker): RedirectResponse
    {
        $circuitBreaker->update($request->validated());

        return redirect()->route('circuit-breakers.index')->with('status', 'circuit-breaker-updated');
    }

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
        return [
            [
                'key' => 'ampere',
                'label' => 'الأمبير',
                'options' => CircuitBreaker::query()
                    ->distinct()
                    ->orderBy('ampere')
                    ->pluck('ampere')
                    ->map(fn ($ampere) => ['value' => (string) $ampere, 'label' => "{$ampere}A"])
                    ->all(),
            ],
        ];
    }
}
