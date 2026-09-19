<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreSubscriberRequest;
use App\Http\Requests\UpdateSubscriberRequest;
use App\Models\Branch;
use App\Models\MeterBox;
use App\Models\Subscriber;
use App\Models\Tariff;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;

class SubscriberController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(): View
    {
        $this->authorize('viewAny', Subscriber::class);

        $actor = auth()->user();

        $subscribers = Subscriber::query()
            ->when(! $actor->isSuperAdmin(), fn ($query) => $query->where('branch_id', $actor->branch_id))
            ->with(['branch', 'meterBox', 'tariff'])
            ->orderBy('full_name')
            ->paginate(15);

        return view('subscribers.index', compact('subscribers'));
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create(): View
    {
        $this->authorize('create', Subscriber::class);

        [$branches, $meterBoxes, $tariffs, $canChooseBranch] = $this->formOptions();

        return view('subscribers.create', compact('branches', 'meterBoxes', 'tariffs', 'canChooseBranch'));
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
    public function edit(Subscriber $subscriber): View
    {
        $this->authorize('update', $subscriber);

        [$branches, $meterBoxes, $tariffs, $canChooseBranch] = $this->formOptions();

        return view('subscribers.edit', compact('subscriber', 'branches', 'meterBoxes', 'tariffs', 'canChooseBranch'));
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
     * @return array{0: \Illuminate\Support\Collection, 1: \Illuminate\Support\Collection, 2: \Illuminate\Support\Collection, 3: bool}
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
            ->get();

        $tariffs = Tariff::orderBy('category')->get();

        return [$branches, $meterBoxes, $tariffs, $canChooseBranch];
    }
}
