<?php

namespace App\Support;

use App\Models\Branch;
use App\Models\CashBox;
use App\Models\ClosingSetting;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * The branch's boxes as the people who close and audit them see them, on
 * the financial boxes page (its open and closed boxes, and the
 * entries of its open boxes): which branch the actor looks at, and its
 * boxes in each place with what the actor may do to them.
 */
class BranchBoxes
{
    public function __construct(private BranchClosingWorkflow $workflow) {}

    /**
     * The branches the actor may open (every branch for administrators and auditors, else
     * their own) and the one asked for with `?branch_id=`, else the first.
     *
     * @return array{0: EloquentCollection<int, Branch>, 1: Branch}
     */
    public function branch(Request $request, User $actor): array
    {
        $allBranches = $actor->isSuperAdmin() || BranchClosingAccess::audit($actor);
        $branches = $allBranches ? Branch::query()->orderBy('name')->get(['id', 'name']) : Branch::query()->whereKey($actor->branch_id)->get(['id', 'name']);
        $branchId = $allBranches ? ($request->integer('branch_id') ?: $branches->first()?->id) : $actor->branch_id;
        $branch = $branches->firstWhere('id', $branchId);
        abort_unless($branch, 404);

        return [$branches, $branch];
    }

    /**
     * The people who had boxes in the branch, by name, to narrow its boxes
     * and entries to one of them.
     *
     * @return EloquentCollection<int, User>
     */
    public function people(int $branchId): EloquentCollection
    {
        return User::query()->whereIn('id', CashBox::query()->where('branch_id', $branchId)->whereNotNull('user_id')->select('user_id'))->orderBy('name')->get(['id', 'name']);
    }

    /** The two states of a financial box, independent of its historical audit metadata. */
    public const PLACES = ['open', 'closed'];

    /** Who closed and sent a box, besides its entries, for the boxes page. */
    private const PEOPLE = ['receivedBy:id,name', 'sentBy:id,name'];

    /**
     * Boxes in one state, narrowed to a week for closed boxes. A linked box
     * may be included separately, subject to the same branch and audit scope.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function rows(int $branchId, User $actor, string $place, ?int $alsoBoxId = null, ?string $week = null): Collection
    {
        $query = $this->in($branchId, $place);
        if ($place === 'closed' && $week) {
            $from = ClosingPeriods::date($week);
            $query->whereRaw('COALESCE(received_at, closed_at, opened_at) >= ?', [$from->utc()])
                ->whereRaw('COALESCE(received_at, closed_at, opened_at) < ?', [$from->addWeek()->utc()]);
        }
        $boxes = $query->with([...BranchClosingWorkflow::BOX_DETAILS, ...self::PEOPLE])->get();
        if ($alsoBoxId && ! $boxes->contains('id', $alsoBoxId)) {
            $boxes->push(...CashBox::query()->where('branch_id', $branchId)->whereKey($alsoBoxId)
                ->when(BranchClosingAccess::closedOnly($actor, $branchId), fn (Builder $query) => $query->where('status', 'received'))
                ->with([...BranchClosingWorkflow::BOX_DETAILS, ...self::PEOPLE])->get());
        }
        $ledgers = $this->ledgers($boxes->flatMap(fn (CashBox $box) => $box->payments->pluck('subscription_transaction_id'))->all());

        return $boxes->map(fn (CashBox $box): array => [
            ...$this->present($box, $ledgers),
            'canCount' => $this->workflow->mayReceive($box, $actor),
            'isOwn' => $box->user_id === $actor->id,
        ]);
    }

    /**
     * Weekly browsing periods use the actual closing date in business time,
     * without rewriting a box or its original closing's saved schedule.
     *
     * @return Collection<int, array{start: string, end: string, count: int}>
     */
    public function periods(int $branchId): Collection
    {
        return CashBox::query()->where('branch_id', $branchId)->where('status', 'received')
            ->get(['received_at', 'closed_at', 'opened_at'])
            ->groupBy(fn (CashBox $box): string => $this->weekOf($box->received_at ?? $box->closed_at ?? $box->opened_at))
            ->map(fn (Collection $boxes, string $start): array => ['start' => $start, 'end' => ClosingPeriods::date($start)->addDays(6)->toDateString(), 'count' => $boxes->count()])
            ->sortKeysDesc()->values();
    }

    public function weekOf(CarbonInterface $moment): string
    {
        return CarbonImmutable::instance($moment)->setTimezone(config('app.business_timezone'))
            ->startOfWeek(ClosingSetting::company()->week_starts_on)->toDateString();
    }

    /**
     * A box as the boxes page shows it: its entries as the subscriber's
     * statement shows them, where it is (`place`), and when it was opened,
     * closed and sent and by whom.
     *
     * @param  array<int, array<string, mixed>>  $ledgers
     * @return array<string, mixed>
     */
    private function present(CashBox $box, array $ledgers = []): array
    {
        $box->user?->makeHidden('permissions');
        $row = $box->toArray();
        unset($row['received_by'], $row['sent_by']);

        return [
            ...$row,
            'status' => $box->isEditable() ? 'open' : $box->status,
            'place' => $this->placeOf($box),
            'stage' => $box->stage(),
            'payments' => array_map(fn (array $entry): array => $this->presentEntry($entry, $ledgers), $row['payments'] ?? []),
            'closed_at' => $box->isEditable() ? null : $box->closed_at,
            'closedAt' => $box->isEditable() ? null : ($box->received_at ?? $box->closed_at),
            'closedBy' => $box->receivedBy?->name,
            'sentBy' => $box->sentBy?->name,
        ];
    }

    /**
     * How many of the branch's boxes are in each place, for the tabs.
     *
     * @return array<string, int>
     */
    public function counts(int $branchId): array
    {
        return collect(self::PLACES)->mapWithKeys(fn (string $place): array => [$place => $this->in($branchId, $place)->count()])->all();
    }

    private function placeOf(CashBox $box): string
    {
        return match (true) {
            $box->status === 'received' => 'closed',
            default => 'open',
        };
    }

    /**
     * The branch's boxes in one place. An open box shows once it holds an
     * entry; closed boxes retain their original records.
     *
     * @return Builder<CashBox>
     */
    private function in(int $branchId, string $place): Builder
    {
        $boxes = CashBox::query()->where('branch_id', $branchId);

        return match ($place) {
            'open' => $boxes->whereIn('status', ['open', 'pending'])->whereHas('payments')->latest('id'),
            'closed' => $boxes->where('status', 'received')->orderByDesc('received_at')->orderByDesc('id'),
        };
    }

    /**
     * Each of the transactions as the subscriber's statement shows it, by id.
     *
     * @param  array<int, int|null>  $transactionIds
     * @return array<int, array<string, mixed>>
     */
    public function ledgers(array $transactionIds): array
    {
        $ids = array_values(array_unique(array_filter($transactionIds)));

        return $ids === [] ? [] : SubscriptionTransaction::query()->whereIn('id', $ids)->with('recordedBy:id,name')->get()
            ->mapWithKeys(fn (SubscriptionTransaction $transaction): array => [$transaction->id => $transaction->ledgerDetails()])->all();
    }

    /**
     * A box entry with links to its subscriber's statement (opened at the
     * entry's own transaction) and, for a
     * payment or clearing, its voucher, and its transaction as the statement shows it
     * when found among `$ledgers`. Entries of a statement saved before the
     * transaction's type was kept get no receipt link.
     *
     * @param  array<string, mixed>  $entry
     * @param  array<int, array<string, mixed>>  $ledgers
     * @return array<string, mixed>
     */
    public function presentEntry(array $entry, array $ledgers = []): array
    {
        $subscriptionId = $entry['transaction']['subscription_id'] ?? null;
        $vouched = in_array($entry['transaction']['type'] ?? null, [SubscriptionTransaction::TYPE_PAYMENT, SubscriptionTransaction::TYPE_CLEARING], true);

        return [
            ...$entry,
            'statement_url' => $subscriptionId ? route('subscriptions.statement', [$subscriptionId, 'transaction' => $entry['subscription_transaction_id'] ?? null]) : null,
            'receipt_url' => $subscriptionId && $vouched ? route('subscriptions.payments.receipt', [$subscriptionId, $entry['transaction']['id']]) : null,
            'ledger' => $ledgers[$entry['subscription_transaction_id'] ?? null] ?? null,
        ];
    }

    /**
     * What the actor may do in the branch's closing.
     *
     * @return array{manage: bool, receive: bool}
     */
    public function access(User $actor, int $branchId): array
    {
        return ['manage' => BranchClosingAccess::manage($actor, $branchId), 'receive' => BranchClosingAccess::receive($actor, $branchId)];
    }
}
