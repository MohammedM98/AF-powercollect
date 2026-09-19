<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreSubscriberRequest;
use App\Http\Requests\UpdateSubscriberRequest;
use App\Models\Branch;
use App\Models\MeterBox;
use App\Models\Subscriber;
use App\Models\Tariff;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class SubscriberController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(): InertiaResponse
    {
        $this->authorize('viewAny', Subscriber::class);

        $actor = auth()->user();

        $subscribers = Subscriber::query()
            ->when(! $actor->isSuperAdmin(), fn ($query) => $query->where('branch_id', $actor->branch_id))
            ->with(['branch', 'meterBox', 'tariff'])
            ->orderBy('full_name')
            ->paginate(15)
            ->through(fn (Subscriber $subscriber) => [
                'id' => $subscriber->id,
                'full_name' => $subscriber->full_name,
                'meter_number' => $subscriber->meter_number,
                'meterBoxNumber' => $subscriber->meterBox?->box_number,
                'tariffCategoryLabel' => __($subscriber->tariff->category->label()),
                'branchName' => $subscriber->branch->name,
                'status' => $subscriber->status->value,
                'statusLabel' => __($subscriber->status->label()),
                'canUpdate' => $actor->can('update', $subscriber),
            ]);

        return Inertia::render('Subscribers/Index', [
            'subscribers' => $subscribers,
            'canCreate' => $actor->can('create', Subscriber::class),
            'status' => session('status'),
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
            'subscriber' => [
                'id' => $subscriber->id,
                'full_name' => $subscriber->full_name,
                'phone' => $subscriber->phone,
                'address' => $subscriber->address,
                'meter_number' => $subscriber->meter_number,
                'meter_box_id' => $subscriber->meter_box_id,
                'tariff_id' => $subscriber->tariff_id,
                'branch_id' => $subscriber->branch_id,
                'status' => $subscriber->status->value,
            ],
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
     * The branch/meter-box/tariff options for the create/edit forms, and
     * whether the actor may choose the branch themselves.
     *
     * @return array{branches: \Illuminate\Support\Collection, meterBoxes: \Illuminate\Support\Collection, tariffs: \Illuminate\Support\Collection, canChooseBranch: bool}
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

        return [
            'branches' => $branches,
            'meterBoxes' => $meterBoxes,
            'tariffs' => $tariffs,
            'canChooseBranch' => $canChooseBranch,
        ];
    }
}
