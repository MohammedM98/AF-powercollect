<?php

namespace App\Http\Controllers;

use App\Enums\SubscriberStatus;
use App\Http\Concerns\FiltersDataTable;
use App\Http\Concerns\FiltersSubscriberList;
use App\Http\Requests\ApplySubscriberBulkChangeRequest;
use App\Models\Subscriber;
use App\Models\SubscriberBulkChange;
use App\Models\SubscriberBulkChangeItem;
use App\Models\User;
use App\Notifications\ActionCompleted;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

/**
 * Changing many subscribers at once from the subscribers list — their
 * minimum charge or their status — for the ticked ones or every one
 * matching the list's filters. Each change is kept with every
 * subscriber's value before and after, listed on its own page, and can be
 * undone: a subscriber whose value was changed again since keeps the
 * newer value.
 */
class SubscriberBulkChangeController extends Controller
{
    use FiltersDataTable, FiltersSubscriberList;

    /**
     * The bulk changes made so far, newest first, with one's subscribers
     * loaded on request (`?change=` with `only: ['details']`).
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', Subscriber::class);

        $actor = $request->user();

        $changes = SubscriberBulkChange::query()
            ->visibleTo($actor)
            ->with(['user', 'undoneBy', 'branch'])
            ->latest('id')
            ->paginate($this->dataTablePerPage($request))
            ->withQueryString()
            ->through(fn (SubscriberBulkChange $change) => [
                'id' => $change->id,
                'field' => $change->field,
                'description' => $change->description,
                'changedCount' => $change->changed_count,
                'branchName' => $change->branch?->name ?? 'كل الفروع',
                'userName' => $change->user?->name,
                'createdAt' => $change->created_at->toIso8601String(),
                'undoneAt' => $change->undone_at?->toIso8601String(),
                'undoneBy' => $change->undoneBy?->name,
                'restoredCount' => $change->restored_count,
                'canUndo' => ! $change->isUndone() && $actor->can('bulkUpdate', [Subscriber::class, $change->field]),
            ]);

        return Inertia::render('Subscribers/BulkChanges', [
            'changes' => $changes,
            'filters' => $this->dataTableState($request, 'created_at', 'desc'),
            'details' => Inertia::optional(fn () => $this->details($request, $actor)),
        ]);
    }

    /**
     * Set the field for every chosen subscriber whose value differs, and
     * keep the change for review and undo.
     */
    public function store(ApplySubscriberBulkChangeRequest $request): RedirectResponse
    {
        $actor = $request->user();
        $field = $request->validated('field');
        $byCircuitBreaker = $field === 'minimum_charge' && $request->validated('mode') === 'circuit_breaker';

        $subscribers = $this->chosenSubscribers($request, $actor)->with('circuitBreaker')->limit(ApplySubscriberBulkChangeRequest::MAX_SUBSCRIBERS + 1)->get();

        if ($subscribers->count() > ApplySubscriberBulkChangeRequest::MAX_SUBSCRIBERS) {
            return back()->withErrors(['ids' => 'يمكن تعديل '.ApplySubscriberBulkChangeRequest::MAX_SUBSCRIBERS.' مشترك على الأكثر في المرة الواحدة؛ ضيّق الفلاتر.']);
        }

        $changes = $subscribers
            ->map(fn (Subscriber $subscriber) => [
                'subscriber' => $subscriber,
                'old' => $this->currentValue($subscriber, $field),
                'new' => $this->normalize($field, $byCircuitBreaker ? $subscriber->circuitBreaker?->minimum_payment : $request->validated('value')),
            ])
            ->filter(fn (array $change) => $change['new'] !== null && $change['new'] !== $change['old'])
            ->values();
        $missingReading = $changes->filter(fn (array $change) => $this->activatesWithoutReading($field, $change));
        $changes = $changes->reject(fn (array $change) => $this->activatesWithoutReading($field, $change))->values();

        if ($changes->isEmpty()) {
            return back()->withErrors(['ids' => $missingReading->isNotEmpty()
                ? 'لا يمكن تفعيل مشترك قبل إدخال قراءته السابقة؛ أدخلها من «تعديل المشترك» أولًا.'
                : 'لا يوجد بين المختارين من تتغير قيمته.']);
        }

        $bulkChange = DB::transaction(function () use ($actor, $field, $byCircuitBreaker, $request, $changes): SubscriberBulkChange {
            $branchIds = $changes->pluck('subscriber.branch_id')->unique();
            $bulkChange = SubscriberBulkChange::create([
                'field' => $field,
                'value' => $byCircuitBreaker ? null : $this->normalize($field, $request->validated('value')),
                'description' => $this->describe($field, $byCircuitBreaker, $request->validated('value')),
                'branch_id' => $actor->isSuperAdmin() ? ($branchIds->count() === 1 ? $branchIds->first() : null) : $actor->branch_id,
                'user_id' => $actor->id,
                'changed_count' => $changes->count(),
            ]);

            foreach ($changes as $change) {
                Subscriber::query()->whereKey($change['subscriber']->id)->update([$field => $change['new']]);
            }

            foreach ($changes->chunk(500) as $chunk) {
                SubscriberBulkChangeItem::insert($chunk->map(fn (array $change) => [
                    'subscriber_bulk_change_id' => $bulkChange->id,
                    'subscriber_id' => $change['subscriber']->id,
                    'old_value' => $change['old'],
                    'new_value' => $change['new'],
                ])->all());
            }

            return $bulkChange;
        });

        $actor->notify(new ActionCompleted('subscribers-bulk-changed', $bulkChange->description.' — '.$bulkChange->changed_count));

        return back()->with('status', 'subscribers-bulk-changed');
    }

    /**
     * Put back each subscriber's value from before the change — unless it
     * was changed again since, which then stays.
     */
    public function undo(Request $request, SubscriberBulkChange $change): RedirectResponse
    {
        $actor = $request->user();

        abort_unless(SubscriberBulkChange::query()->visibleTo($actor)->whereKey($change->id)->exists(), 404);
        $this->authorize('bulkUpdate', [Subscriber::class, $change->field]);

        if ($change->isUndone()) {
            return back()->withErrors(['undo' => 'تم التراجع عن هذا التعديل من قبل.']);
        }

        DB::transaction(function () use ($change, $actor): void {
            $restored = 0;
            $change->items()->with('subscriber')->lockForUpdate()->get()->each(function (SubscriberBulkChangeItem $item) use ($change, &$restored): void {
                if ($item->subscriber !== null && $this->currentValue($item->subscriber, $change->field) === $item->new_value) {
                    Subscriber::query()->whereKey($item->subscriber_id)->update([$change->field => $item->old_value]);
                    $restored++;
                }
            });

            $change->update(['undone_at' => now(), 'undone_by' => $actor->id, 'restored_count' => $restored]);
        });

        $actor->notify(new ActionCompleted('subscribers-bulk-undone', $change->description));

        return back()->with('status', 'subscribers-bulk-undone');
    }

    /**
     * The subscribers chosen in the list, among those the actor may see.
     */
    private function chosenSubscribers(ApplySubscriberBulkChangeRequest $request, User $actor): Builder
    {
        $query = Subscriber::query()
            ->select('subscribers.*')
            ->selectRaw("COALESCE(NULLIF(subscription_name, ''), full_name) as display_name")
            ->visibleTo($actor);

        return $request->boolean('all')
            ? $this->applySubscriberListFilters($query, $request)
            : $query->whereIn('subscribers.id', $request->validated('ids'));
    }

    /**
     * One bulk change's subscribers with their value before and after,
     * and what each has now.
     *
     * @return array{id: int, field: string, items: Collection<int, array<string, mixed>>}|null
     */
    private function details(Request $request, User $actor): ?array
    {
        $change = SubscriberBulkChange::query()->visibleTo($actor)->find($request->integer('change'));

        if ($change === null) {
            return null;
        }

        return [
            'id' => $change->id,
            'field' => $change->field,
            'items' => $change->items()->with('subscriber')->get()->map(fn (SubscriberBulkChangeItem $item) => [
                'id' => $item->id,
                'name' => $item->subscriber?->displayName() ?? 'مشترك محذوف',
                'accountNumber' => $item->subscriber?->account_number,
                'old' => $this->display($change->field, $item->old_value),
                'new' => $this->display($change->field, $item->new_value),
                'now' => $item->subscriber ? $this->display($change->field, $this->currentValue($item->subscriber, $change->field)) : '—',
            ]),
        ];
    }

    /** The subscriber's stored value of the field, as a bulk change keeps it. */
    /**
     * Whether the change would make a subscriber active before their
     * starting reading has been entered.
     *
     * @param  array{subscriber: Subscriber, old: ?string, new: ?string}  $change
     */
    private function activatesWithoutReading(string $field, array $change): bool
    {
        return $field === 'status' && $change['new'] === SubscriberStatus::Active->value && $change['subscriber']->initial_reading === null;
    }

    private function currentValue(Subscriber $subscriber, string $field): ?string
    {
        return $this->normalize($field, $subscriber->getRawOriginal($field));
    }

    /** A value as kept: amounts with two decimals, statuses as their key. */
    private function normalize(string $field, mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return $field === 'minimum_charge' ? number_format((float) $value, 2, '.', '') : (string) $value;
    }

    /** A kept value as people read it. */
    private function display(string $field, ?string $value): string
    {
        if ($value === null) {
            return '—';
        }

        return $field === 'status'
            ? __(SubscriberStatus::from($value)->label())
            : rtrim(rtrim($value, '0'), '.').' شيكل';
    }

    private function describe(string $field, bool $byCircuitBreaker, mixed $value): string
    {
        return match (true) {
            $field === 'status' => 'الحالة ← '.$this->display('status', (string) $value),
            $byCircuitBreaker => 'الحد الأدنى ← حد القاطع لكل مشترك',
            default => 'الحد الأدنى ← '.$this->display('minimum_charge', $this->normalize('minimum_charge', $value)),
        };
    }
}
