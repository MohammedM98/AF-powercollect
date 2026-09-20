<?php

namespace App\Http\Controllers;

use App\Enums\BillingType;
use App\Http\Concerns\FiltersDataTable;
use App\Http\Requests\StoreSubscriberRequest;
use App\Http\Requests\UpdateSubscriberRequest;
use App\Models\Area;
use App\Models\Branch;
use App\Models\MeterBox;
use App\Models\Subscriber;
use App\Models\Tariff;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class SubscriberController extends Controller
{
    use FiltersDataTable;

    private const SORTABLE = ['full_name', 'meter_number', 'status', 'created_at'];

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', Subscriber::class);

        $actor = auth()->user();

        $query = Subscriber::query()
            ->when(! $actor->isSuperAdmin(), fn ($q) => $q->where('branch_id', $actor->branch_id))
            ->with(['branch', 'meterBox', 'tariff']);
        $this->applyDataTableFilters($query, $request, ['full_name', 'phone', 'meter_number', 'address'], self::SORTABLE, 'full_name');

        $subscribers = $query->paginate($this->dataTablePerPage($request))
            ->withQueryString()
            ->through(fn (Subscriber $subscriber) => [
                ...$this->editableFields($subscriber),
                'meterBoxNumber' => $subscriber->meterBox?->box_number,
                'tariffCategoryLabel' => __($subscriber->tariff->category->label()),
                'branchName' => $subscriber->branch->name,
                'statusLabel' => __($subscriber->status->label()),
                'canUpdate' => $actor->can('update', $subscriber),
            ]);

        return Inertia::render('Subscribers/Index', [
            'subscribers' => $subscribers,
            'canCreate' => $actor->can('create', Subscriber::class),
            'status' => session('status'),
            'filters' => $this->dataTableState($request, 'full_name'),
            ...$this->formOptions(),
        ]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create(): InertiaResponse
    {
        $this->authorize('create', Subscriber::class);

        return Inertia::render('Subscribers/Create', $this->formOptions());
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(StoreSubscriberRequest $request): RedirectResponse
    {
        $actor = auth()->user();
        $data = $request->validated();

        if (! $actor->isSuperAdmin()) {
            $data['branch_id'] = $actor->branch_id;
        }

        $data['registered_by'] = $actor->id;

        Subscriber::create($data);

        return redirect()->route('subscribers.index')->with('status', 'subscriber-created');
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Subscriber $subscriber): InertiaResponse
    {
        $this->authorize('update', $subscriber);

        return Inertia::render('Subscribers/Edit', [
            'subscriber' => $this->editableFields($subscriber),
            ...$this->formOptions(),
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(UpdateSubscriberRequest $request, Subscriber $subscriber): RedirectResponse
    {
        $data = $request->validated();

        $subscriber->update($data);

        return redirect()->route('subscribers.index')->with('status', 'subscriber-updated');
    }

    /**
     * The full set of a subscriber's editable fields — used both for the
     * dedicated edit page and for the edit modal's initial form data on
     * the index page, so both stay backed by the same shape.
     *
     * @return array<string, mixed>
     */
    private function editableFields(Subscriber $subscriber): array
    {
        return [
            'id' => $subscriber->id,
            'full_name' => $subscriber->full_name,
            'phone' => $subscriber->phone,
            'address' => $subscriber->address,
            'meter_number' => $subscriber->meter_number,
            'meter_box_id' => $subscriber->meter_box_id,
            'tariff_id' => $subscriber->tariff_id,
            'branch_id' => $subscriber->branch_id,
            'status' => $subscriber->status->value,
            'billing_type' => $subscriber->billing_type?->value,
            'unit_price' => $subscriber->unit_price,
            'minimum_charge' => $subscriber->minimum_charge,
            'ampere_count' => $subscriber->ampere_count,
            'area_1_id' => $subscriber->area_1_id,
            'area_2_id' => $subscriber->area_2_id,
            'customer_classification' => $subscriber->customer_classification,
            'previous_reading' => $subscriber->previous_reading,
            'subscription_fee' => $subscriber->subscription_fee,
            'subscription_date' => $subscriber->subscription_date?->format('Y-m-d'),
            'charge_subscription_fee' => $subscriber->charge_subscription_fee,
            'notes' => $subscriber->notes,
        ];
    }

    /**
     * The branch/meter-box/tariff options for the create/edit forms, and
     * whether the actor may choose the branch themselves.
     *
     * @return array{branches: \Illuminate\Support\Collection, meterBoxes: \Illuminate\Support\Collection, tariffs: \Illuminate\Support\Collection, areas: \Illuminate\Support\Collection, canChooseBranch: bool}
     */
    private function formOptions(): array
    {
        $actor = auth()->user();
        $canChooseBranch = $actor->isSuperAdmin();

        $branches = $canChooseBranch ? Branch::orderBy('name')->get() : collect();

        $meterBoxes = MeterBox::query()
            ->when(! $canChooseBranch, fn ($query) => $query->where('branch_id', $actor->branch_id))
            ->with('branch')
            ->orderBy('box_number')
            ->get()
            ->map(fn (MeterBox $box) => [
                'id' => $box->id,
                'box_number' => $box->box_number,
                'branchName' => $box->branch->name,
            ]);

        $tariffs = Tariff::orderBy('category')->get()->map(fn (Tariff $tariff) => [
            'id' => $tariff->id,
            'categoryLabel' => __($tariff->category->label()),
        ]);

        $billingTypeOptions = collect(BillingType::cases())->map(fn (BillingType $type) => [
            'value' => $type->value,
            'label' => __($type->label()),
        ]);

        return [
            'branches' => $branches,
            'meterBoxes' => $meterBoxes,
            'tariffs' => $tariffs,
            'areas' => Area::orderBy('name')->get(),
            'canChooseBranch' => $canChooseBranch,
            'billingTypeOptions' => $billingTypeOptions,
        ];
    }
}
