<?php

namespace App\Http\Controllers;

use App\Enums\TransactionAction;
use App\Http\Concerns\BuildsSubscriberStatement;
use App\Http\Concerns\FiltersDataTable;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\TransactionAmendment;
use App\Models\TransactionDeletion;
use App\Models\User;
use App\Support\DailySeries;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

/**
 * The audit log (سجل التدقيق): every change made to the subscribers' account
 * lines after they were recorded, newest first — details edited in place,
 * lines cancelled or corrected, payments refunded and lines deleted for
 * good — with who did it, when and why. Read-only; a row opens the
 * subscriber's statement over the page.
 */
class TransactionAuditController extends Controller
{
    use BuildsSubscriberStatement, FiltersDataTable;

    /**
     * The period tabs, as the number of days each covers (null: since the
     * first change).
     */
    private const PERIODS = ['today' => 1, '7' => 7, '30' => 30, '90' => 90, 'all' => null];

    private const DEFAULT_PERIOD = '30';

    private const DEFAULT_PER_PAGE = 25;

    /**
     * The kinds of change, as the "الإجراء" filter and column name them.
     *
     * @var array<string, string>
     */
    private const KINDS = [
        'amendment' => 'تعديل',
        'cancellation' => 'إلغاء',
        'correction' => 'تصحيح',
        'refund' => 'إرجاع',
        'deletion' => 'حذف نهائي',
    ];

    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewTransactionAudit', SubscriberTransaction::class);

        $actor = $request->user();
        $period = $this->period($request);
        $days = self::PERIODS[$period];
        $from = $days ? DailySeries::startOfDay($days - 1) : null;
        $kind = $this->filterValue($request, 'kind');

        $inPeriod = fn (): QueryBuilder => $this->filteredEvents($request, $actor)
            ->when($from, fn (QueryBuilder $query) => $query->where('happened_at', '>=', $from));

        $events = $inPeriod()
            ->when(array_key_exists((string) $kind, self::KINDS), fn (QueryBuilder $query) => $query->where('kind', $kind))
            ->orderByDesc('happened_at')
            ->orderByDesc('event_id')
            ->paginate($this->dataTablePerPage($request, self::DEFAULT_PER_PAGE))
            ->withQueryString();

        $rows = $this->rows(collect($events->items()));
        $events->setCollection($rows);

        return Inertia::render('TransactionAudit/Index', [
            'events' => $events,
            'period' => $period,
            'counts' => $this->counts($inPeriod()),
            'today' => DailySeries::today()->toDateString(),
            'scopeLabel' => $actor->isSuperAdmin() ? 'كل الفروع' : ($actor->branch?->name ?? '—'),
            'filters' => $this->dataTableState($request, 'happened_at', 'desc', self::DEFAULT_PER_PAGE),
            'filterOptions' => $this->filterOptions($actor),
            // A row's subscriber's statement, opened over the log.
            'statement' => fn () => $this->requestedStatement($request, $actor),
        ]);
    }

    /**
     * Every change as one list — `kind`, `event_id` (the row of its own
     * table), `happened_at`, `user_id` (who made it) and `subscriber_id` —
     * of subscribers the user may see, narrowed by the search box, the
     * branch and who made it. Unordered, so it can be counted.
     */
    private function filteredEvents(Request $request, User $actor): QueryBuilder
    {
        $search = $this->searchTerm($request);
        $branchId = $actor->isSuperAdmin() ? $this->filterValue($request, 'branch_id') : null;
        $userId = $this->filterValue($request, 'user_id');
        $narrowsSubscribers = ! $actor->isSuperAdmin() || $branchId !== null || $search !== '';

        $amendments = DB::table('transaction_amendments')
            ->join('subscriber_transactions', 'subscriber_transactions.id', '=', 'transaction_amendments.transaction_id')
            ->selectRaw("'amendment' as kind, transaction_amendments.id as event_id, transaction_amendments.created_at as happened_at, transaction_amendments.user_id as user_id, subscriber_transactions.subscriber_id as subscriber_id");

        $reversals = DB::table('subscriber_transactions as reversal')
            ->whereIn('reversal.type', SubscriberTransaction::REVERSAL_TYPES)
            ->selectRaw(
                "case when reversal.type = ? then 'refund' "
                ."when reversal.type = ? and exists (select 1 from subscriber_transactions as replacement where replacement.corrects_id = reversal.reverses_id) then 'correction' "
                ."else 'cancellation' end as kind, reversal.id as event_id, reversal.created_at as happened_at, reversal.recorded_by as user_id, reversal.subscriber_id as subscriber_id",
                [SubscriberTransaction::TYPE_REFUND, SubscriberTransaction::TYPE_REVERSAL],
            );

        $deletions = DB::table('transaction_deletions')
            ->selectRaw("'deletion' as kind, id as event_id, created_at as happened_at, user_id, subscriber_id");

        return DB::query()
            ->fromSub($amendments->unionAll($reversals)->unionAll($deletions), 'events')
            ->when($narrowsSubscribers, fn (QueryBuilder $query) => $query->whereIn('subscriber_id', Subscriber::query()
                ->visibleTo($actor)
                ->when($branchId, fn (Builder $subscribers) => $subscribers->where('branch_id', $branchId))
                ->when($search !== '', fn (Builder $subscribers) => $subscribers->matchingSearch($search))
                ->select('subscribers.id')))
            ->when($userId, fn (QueryBuilder $query) => $query->where('user_id', $userId));
    }

    /**
     * How many changes of each kind the period holds.
     *
     * @return array<string, int>
     */
    private function counts(QueryBuilder $inPeriod): array
    {
        $counts = $inPeriod->selectRaw('kind, count(*) as total')->groupBy('kind')->pluck('total', 'kind');

        return collect(self::KINDS)->map(fn (string $label, string $kind): int => (int) ($counts[$kind] ?? 0))->all();
    }

    /**
     * The page's changes, each with what the log shows of it.
     *
     * @param  Collection<int, object{kind: string, event_id: int}>  $events
     * @return Collection<int, array<string, mixed>>
     */
    private function rows(Collection $events): Collection
    {
        $ids = fn (array $kinds): array => $events->whereIn('kind', $kinds)->pluck('event_id')->all();
        $amendments = TransactionAmendment::query()->with(['user', 'transaction.subscriber.branch'])->findMany($ids(['amendment']))->keyBy('id');
        $reversals = SubscriberTransaction::query()
            ->with(['recordedBy', 'subscriber.branch', 'reverses.correction'])
            ->findMany($ids(['cancellation', 'correction', 'refund']))
            ->keyBy('id');
        $deletions = TransactionDeletion::query()->with(['user', 'subscriber.branch'])->findMany($ids(['deletion']))->keyBy('id');

        return $events
            ->map(fn (object $event): ?array => match ($event->kind) {
                'amendment' => $amendments->has($event->event_id) ? $this->amendmentRow($amendments[$event->event_id]) : null,
                'deletion' => $deletions->has($event->event_id) ? $this->deletionRow($deletions[$event->event_id]) : null,
                default => $reversals->has($event->event_id) ? $this->reversalRow($event->kind, $reversals[$event->event_id]) : null,
            })
            ->filter()
            ->values();
    }

    /**
     * @return array<string, mixed>
     */
    private function amendmentRow(TransactionAmendment $amendment): array
    {
        $line = $amendment->transaction;

        return [
            ...$this->eventBase('amendment', $amendment->id, $amendment->created_at, $amendment->user, $line->subscriber),
            'lines' => [$this->lineSummary($line->type, $line->amount, $line->displayVoucherNumber())],
            'changes' => collect($amendment->changes)->map(fn (array $values, string $field): array => [
                'label' => $this->amendmentFieldLabel($field),
                'from' => $values[0] ?? null,
                'to' => $values[1] ?? null,
            ])->values()->all(),
            'reason' => $amendment->reason,
            'notes' => null,
        ];
    }

    /**
     * A cancellation, a correction or a refund: the reversal line it
     * added, and why from the line it reverses.
     *
     * @return array<string, mixed>
     */
    private function reversalRow(string $kind, SubscriberTransaction $reversal): array
    {
        $original = $reversal->reverses;
        $isFullRefund = $kind === 'refund' && $original?->status === SubscriberTransaction::STATUS_LINKED_CANCELLATION;

        return [
            ...$this->eventBase($kind, $reversal->id, $reversal->created_at, $reversal->recordedBy, $reversal->subscriber),
            'kindNote' => $kind === 'refund' ? ($isFullRefund ? 'كامل' : 'جزئي') : null,
            'lines' => [
                $original
                    ? $this->lineSummary($original->type, $original->amount, $original->displayVoucherNumber())
                    : $this->lineSummary($reversal->type, $reversal->amount, null),
                ...($kind === 'refund' ? [['label' => 'المبلغ المُرجع', 'amount' => SubscriberTransaction::formatAmount(abs((float) $reversal->amount)), 'voucherNumber' => null]] : []),
            ],
            'changes' => [],
            // A partial refund leaves the payment standing, without a reason of its own.
            'reason' => $original?->cancellation_reason && ($kind !== 'refund' || $isFullRefund) ? __($original->cancellation_reason->label()) : null,
            'notes' => $kind !== 'refund' || $isFullRefund ? $original?->cancellation_notes : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function deletionRow(TransactionDeletion $deletion): array
    {
        return [
            ...$this->eventBase('deletion', $deletion->id, $deletion->created_at, $deletion->user, $deletion->subscriber),
            'kindNote' => match ($deletion->action) {
                TransactionAction::DeleteReversal->value => 'الإلغاء فقط، وعادت الحركة الأصلية',
                TransactionAction::DeleteTree->value => 'الحركة وكل ما ارتبط بها',
                default => null,
            },
            'lines' => collect($deletion->transactions)
                ->map(fn (array $line): array => $this->lineSummary(
                    (string) ($line['type'] ?? ''),
                    (string) ($line['amount'] ?? '0'),
                    filled($line['manual_voucher_number'] ?? null)
                        ? $line['manual_voucher_number']
                        : (filled($line['voucher_number'] ?? null) ? str_pad((string) $line['voucher_number'], 6, '0', STR_PAD_LEFT) : null),
                ))
                ->all(),
            'changes' => [],
            'reason' => $deletion->reason,
            'notes' => null,
        ];
    }

    /**
     * What every row shows: its kind, when (business time), who made the
     * change, and whose account it was on.
     *
     * @return array<string, mixed>
     */
    private function eventBase(string $kind, int $id, mixed $at, ?User $user, ?Subscriber $subscriber): array
    {
        return [
            'key' => $kind.'-'.$id,
            'kind' => $kind,
            'kindLabel' => self::KINDS[$kind],
            'kindNote' => null,
            'day' => DailySeries::localDate($at),
            'time' => DailySeries::localTime($at),
            'userName' => $user?->name,
            'subscriber' => $subscriber ? [
                'id' => $subscriber->id,
                'name' => $subscriber->displayName(),
                'accountNumber' => $subscriber->account_number,
                'status' => $subscriber->status->value,
                'statusLabel' => __($subscriber->status->label()),
                'branchName' => $subscriber->branch->name,
            ] : null,
        ];
    }

    /**
     * A line as the log names it: its type, its amount in shekels and its
     * voucher, if any.
     *
     * @return array{label: string, amount: string, voucherNumber: ?string}
     */
    private function lineSummary(string $type, string $amount, ?string $voucherNumber): array
    {
        return [
            'label' => SubscriberTransaction::typeLabels()[$type] ?? 'حركة',
            'amount' => SubscriberTransaction::formatAmount(abs((float) $amount)),
            'voucherNumber' => $voucherNumber,
        ];
    }

    /**
     * The filters: the branch (the Super Admin's only — everyone else's
     * log is their own branch), the kind of change, and who made it.
     *
     * @return array<int, array{key: string, label: string, options: array<int, array{value: string, label: string}>}>
     */
    private function filterOptions(User $actor): array
    {
        $groups = $actor->isSuperAdmin() ? [$this->branchFilterGroup()] : [];

        $groups[] = $this->filterGroup('kind', 'الإجراء', collect(self::KINDS)->map(fn (string $label, string $value): array => ['value' => $value, 'label' => $label])->values());
        $groups[] = $this->filterGroup('user_id', 'بواسطة', $this->staffOptions(
            User::query()
                // Branch staff see their branch's staff and the Super Admins, who have no branch.
                ->when(! $actor->isSuperAdmin(), fn (Builder $users) => $users->where(fn (Builder $inBranch) => $inBranch
                    ->where('branch_id', $actor->branch_id)
                    ->orWhereNull('branch_id')))
                ->orderBy('name')
                ->get(),
        ));

        return $groups;
    }

    private function period(Request $request): string
    {
        $period = $request->query('period');

        return is_string($period) && array_key_exists($period, self::PERIODS) ? $period : self::DEFAULT_PERIOD;
    }

    /**
     * One `?filter[key]=` value, or null when it is missing, empty or not
     * plain text.
     */
    private function filterValue(Request $request, string $key): ?string
    {
        $value = $request->input("filter.{$key}");

        return is_scalar($value) && (string) $value !== '' ? (string) $value : null;
    }
}
