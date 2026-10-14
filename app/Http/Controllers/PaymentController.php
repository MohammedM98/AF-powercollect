<?php

namespace App\Http\Controllers;

use App\Enums\CashBoxType;
use App\Enums\ChargeType;
use App\Enums\DiscountMethod;
use App\Enums\PaymentMethod;
use App\Enums\PermissionKey;
use App\Enums\SubscriptionStatus;
use App\Http\Concerns\BuildsSubscriptionStatement;
use App\Http\Concerns\FiltersDataTable;
use App\Http\Concerns\FiltersSubscriptionList;
use App\Http\Requests\StoreSplitPaymentRequest;
use App\Models\AuditNote;
use App\Models\CashBox;
use App\Models\CashBoxPayment;
use App\Models\Closing;
use App\Models\ClosingSetting;
use App\Models\CollectorDebt;
use App\Models\MeterBox;
use App\Models\StandingDiscount;
use App\Models\SubArea;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\Tariff;
use App\Models\User;
use App\Support\BranchBoxes;
use App\Support\BranchClosingAccess;
use App\Support\BranchClosingWorkflow;
use App\Support\ClosingPeriods;
use App\Support\DailySeries;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PaymentController extends Controller
{
    use BuildsSubscriptionStatement, FiltersDataTable, FiltersSubscriptionList;

    public function __construct(private BranchClosingWorkflow $workflow, private BranchBoxes $branchBoxes) {}

    /** The columns the subscribers table may be sorted by. */
    private const SORTABLE = ['account_number', 'display_name', 'status', 'outstanding_balance'];

    /**
     * The "Balance" filter: what a subscriber owes, against the sum of their
     * account's lines (positive is what they owe).
     */
    private const BALANCE_FILTERS = ['owing' => ['>', 'عليه رصيد مستحق'], 'settled' => ['=', 'مسدّد'], 'credit' => ['<', 'له رصيد دائن']];

    /** The most subscriptions the split form's search lists; a longer list asks the user to narrow the search. */
    private const RESULT_LIMIT = 12;

    /** The payments listed under the day's totals. */
    private const RECENT_PAYMENTS = 8;

    /** How many of an open box's entries the boxes page lists at a time. */
    private const OPEN_BOX_ENTRIES = 25;

    /**
     * The quick payments page: the subscribers of the user's branch in a table
     * (search, filters and sort, with each one's balance) with a button on each
     * to record their payment and a menu for the account's other lines
     * (charge, discount, clearing, a split transfer), and a button for one
     * transfer shared between several subscribers; what the user collected
     * is on the summary page. It takes only the "Record Collections"
     * permission, so it works for someone who cannot open the subscriptions
     * list; the charge, discount and clearing need "Adjust Balances" too.
     */
    public function index(Request $request): InertiaResponse
    {
        $this->authorize('recordAnyPayment', Subscription::class);

        $actor = $request->user();
        $canAdjustBalances = $actor->hasPermission(PermissionKey::AdjustBalances);
        $query = Subscription::query()
            ->select('subscriptions.*')
            ->selectRaw("COALESCE(NULLIF(subscription_name, ''), full_name) as display_name")
            ->visibleTo($actor)
            ->with(['branch', 'meterBox.subArea', 'circuitBreaker', 'profile', ...($canAdjustBalances ? ['standingDiscount.grantedBy'] : [])])
            ->withSum('transactions as outstanding_balance', 'amount');
        $this->applyTableFilters($query, $request);

        return Inertia::render('Payments/Index', [
            'subscriptions' => $query->paginate($this->dataTablePerPage($request))
                ->withQueryString()
                ->through(fn (Subscription $subscription): array => [
                    ...$this->row($subscription),
                    'canAdjustBalance' => $actor->can('adjustBalance', $subscription),
                    'standingDiscount' => $canAdjustBalances ? $this->statementStandingDiscount($subscription->standingDiscount) : null,
                ]),
            'scopeLabel' => $actor->isSuperAdmin() ? 'كل الفروع' : ($actor->branch?->name ?? '—'),
            'filters' => $this->dataTableState($request, 'display_name'),
            'filterOptions' => $this->filterOptions($actor, $request),
            ...$this->collectionCounts($actor),
            'collectionUrls' => $this->collectionUrls(),
            'paymentMethods' => PaymentMethod::options(PaymentMethod::offered()),
            'transferBanks' => config('powercollect.transfer_banks'),
            'senderBanks' => config('powercollect.sender_banks'),
            'chargeTypes' => ChargeType::formOptions(),
            'discountMethods' => DiscountMethod::options(),
            'discountSegments' => $canAdjustBalances ? StandingDiscount::segmentSuggestions() : [],
        ]);
    }

    /**
     * The collector's summary: what they collected today and their latest
     * payments, what waits on them (a handover to confirm, audit notes,
     * debts), and the boxes open now with
     * their entries (`?open=` picks the type, `?entries_page=` the page).
     */
    public function summary(Request $request): InertiaResponse
    {
        $this->authorize('viewOwnCashBoxes', Subscription::class);

        $actor = $request->user();
        $cashBox = $this->ownCashBoxes($actor);

        return Inertia::render('Payments/Summary', [
            'today' => $this->todaysPayments($actor),
            'cashBox' => $cashBox,
            'current' => $cashBox['current'],
            'openBox' => $this->openBoxEntries($request, $cashBox['current']),
            'needsAction' => $cashBox['needsAction'],
            ...$this->collectionCounts($actor),
            'collectionUrls' => $this->collectionUrls(),
        ]);
    }

    /**
     * The financial boxes: for those who close the branch's boxes, every box
     * of the branch in one table, their own among them; for a collector,
     * every box they had, filtered by `?type=` and `?state=`, each with its
     * totals, dates, who closed it and its report.
     */
    public function cashBoxes(Request $request): InertiaResponse
    {
        $actor = $request->user();
        if (BranchClosingAccess::view($actor)) {
            return $this->branchCashBoxes($request);
        }
        $this->authorize('viewOwnCashBoxes', Subscription::class);

        $started = $this->boxesStarted($actor);
        if ($started) {
            $this->workflow->refresh($actor->branch_id);
        }
        $type = in_array($request->query('type'), array_column(CashBoxType::cases(), 'value'), true) ? $request->query('type') : '';
        $state = in_array($request->query('state'), ['open', 'closed'], true) ? $request->query('state') : '';
        $perPage = $this->dataTablePerPage($request);
        $boxes = $this->ownBoxQuery($actor)
            ->when($type, fn (Builder $query) => $query->where('type', $type))
            ->when($state === 'open', fn (Builder $query) => $query->where('status', 'open'))
            ->when($state === 'closed', fn (Builder $query) => $query->where('status', '!=', 'open'))
            ->paginate($perPage)->withQueryString()->through(fn (CashBox $box): array => $this->cashBoxRow($box));

        return Inertia::render('Payments/CashBoxes', [
            'started' => $started,
            'branchName' => $actor->branch?->name,
            'boxes' => $boxes,
            'filters' => ['type' => $type, 'state' => $state, 'per_page' => $perPage],
            ...$this->collectionCounts($actor),
            'collectionUrls' => $this->collectionUrls(),
        ]);
    }

    /**
     * Every entry of the open boxes in one table, each as the subscriber's
     * statement shows it and with the box it sits in, filtered by
     * `?filter[type]=` to one type of box (cash, bank transfers or
     * clearings), and searched by subscriber, voucher, transfer reference or
     * box number: every entry of the branch for those who close its boxes,
     * else the collector's own. The entries of a closed box are looked over
     * inside that box.
     */
    public function entries(Request $request): InertiaResponse
    {
        $actor = $request->user();
        if (BranchClosingAccess::view($actor)) {
            return $this->branchEntries($request);
        }
        $this->authorize('viewOwnCashBoxes', Subscription::class);
        $query = CashBoxPayment::query()->whereHas('box', fn (Builder $box) => $box->where('branch_id', $actor->branch_id)->where('user_id', $actor->id)->where('kind', '!=', 'direct')->where('status', 'open'));

        return Inertia::render('Payments/Entries', [
            'scope' => 'own',
            'started' => $this->boxesStarted($actor),
            'branchName' => $actor->branch?->name,
            ...$this->entryList($request, $query, fn (CashBox $box): string => route('payments.cash-boxes.show', $box)),
            ...$this->collectionCounts($actor),
            'collectionUrls' => $this->collectionUrls(),
        ]);
    }

    /**
     * Every entry of the branch's open boxes, for those who close them,
     * theirs among them: whose box each sits in, narrowed to one person's
     * boxes by `?filter[user]=`, filtered and searched as the collector's
     * entries are, with a link that opens its box on the financial boxes
     * page, and the open boxes of each type the actor may close at once.
     */
    private function branchEntries(Request $request): InertiaResponse
    {
        $actor = $request->user();
        [$branches, $branch] = $this->branchBoxes->branch($request, $actor);
        $people = $this->branchBoxes->people($branch->id);
        $person = $people->firstWhere('id', $request->integer('filter.user'));
        $query = CashBoxPayment::query()->whereHas('box', fn (Builder $box) => $box->where('branch_id', $branch->id)->where('status', 'open')->when($person, fn (Builder $box) => $box->where('user_id', $person->id)));
        $list = $this->entryList($request, $query, fn (CashBox $box): string => route('payments.cash-boxes', ['branch_id' => $branch->id, 'box' => $box->id]));
        $list['filters']['filter']['user'] = $person ? (string) $person->id : '';
        $started = ClosingSetting::forBranch($branch->id)->workflow_started_at !== null;

        return Inertia::render('Payments/Entries', [
            'scope' => 'branch',
            'started' => $started,
            'branchName' => $branch->name,
            'branch' => $branch, 'branches' => $branches, 'people' => $people,
            ...$list,
            'closableBoxes' => $started && BranchClosingAccess::receive($actor, $branch->id) ? $this->closableBoxes($branch->id, $actor, $person?->id) : null,
            ...($actor->can('viewOwnCashBoxes', Subscription::class) ? $this->collectionCounts($actor) : ['pendingCount' => 0]),
            'collectionUrls' => $this->collectionUrls(),
            'urls' => ['actions' => url('/reconciliation/actions')],
        ]);
    }

    /**
     * The open boxes of the branch the actor may confirm closed, one
     * person's when `$userId` is given, each with whose it is, how many
     * entries are still in effect and their totals, to close them by type.
     *
     * @return list<array{id: int, number: string, type: string, person: string|null, count: int, totals: array<string, string>}>
     */
    private function closableBoxes(int $branchId, User $actor, ?int $userId): array
    {
        return $this->workflow->closableBoxes($branchId, $actor, userId: $userId)->load(['user:id,name', 'payments.transaction:id,status'])
            ->map(fn (CashBox $box): array => [
                'id' => $box->id, 'number' => $box->number, 'type' => $box->type->value, 'person' => $box->user?->name,
                'count' => $box->payments->filter(fn (CashBoxPayment $entry): bool => $entry->transaction?->status === SubscriptionTransaction::STATUS_ACTIVE)->count(),
                'totals' => $box->totals(),
            ])->all();
    }

    /**
     * One page of box entries, newest first, with how many sit in each type
     * of box.
     *
     * @param  Builder<CashBoxPayment>  $query
     * @param  callable(CashBox): string  $boxUrl
     * @return array{entries: LengthAwarePaginator<int, array<string, mixed>>, filters: array{filter: array{type: string}, search: string, per_page: int}, counts: array<string, int>}
     */
    private function entryList(Request $request, Builder $query, callable $boxUrl): array
    {
        $types = array_column(CashBoxType::cases(), 'value');
        $filter = in_array($request->input('filter.type'), $types, true) ? $request->input('filter.type') : '';
        $search = trim((string) $request->query('search'));
        $perPage = $this->dataTablePerPage($request);
        $ofType = fn (Builder $entries, string $type) => $entries->whereHas('box', fn (Builder $box) => $box->where('type', $type));
        $searched = (clone $query)->when($search !== '', fn (Builder $entries) => $entries->where(fn (Builder $matching) => $matching
            ->whereHas('transaction.subscription', fn (Builder $subscription) => $subscription->matchingSearch($search))
            ->orWhereHas('transaction', fn (Builder $transaction) => $transaction->where(fn (Builder $numbers) => $numbers->where('voucher_number', $search)->orWhere('manual_voucher_number', $search)->orWhere('reference_number', 'like', "%{$search}%")))
            ->orWhereHas('box', fn (Builder $box) => $box->where('number', $search))));
        $entries = (clone $searched)
            ->when($filter !== '', fn (Builder $entries) => $ofType($entries, $filter))
            ->with(['box:id,number,type,user_id', 'box.user:id,name', 'transaction', 'transaction.recordedBy:id,name', 'transaction.subscription:id,full_name,subscription_name,account_number'])
            ->orderByDesc('occurred_at')->orderByDesc('id')
            ->paginate($perPage)->withQueryString()
            ->through(fn (CashBoxPayment $entry): array => [
                ...$this->cashBoxEntry($entry),
                'box' => ['id' => $entry->box->id, 'number' => $entry->box->number, 'type' => $entry->box->type->value, 'url' => $boxUrl($entry->box)],
                'collector' => $entry->box->user?->name,
            ]);

        return [
            'entries' => $entries,
            'filters' => ['filter' => ['type' => $filter], 'search' => $search, 'per_page' => $perPage],
            'counts' => ['all' => (clone $searched)->count(), ...collect($types)->mapWithKeys(fn (string $type): array => [$type => $ofType(clone $searched, $type)->count()])->all()],
        ];
    }

    /**
     * The financial boxes page for those who close the branch's boxes: every
     * box of the branch's people in one table, their own among them, to look
     * over its entries and confirm it closed.
     */
    private function branchCashBoxes(Request $request): InertiaResponse
    {
        $actor = $request->user();
        [$branches, $branch] = $this->branchBoxes->branch($request, $actor);
        $started = ClosingSetting::forBranch($branch->id)->workflow_started_at !== null;
        if ($started) {
            $this->workflow->refresh($branch->id);
        }
        $closings = $this->branchBoxes->closings($branch->id);

        return Inertia::render('Payments/BranchCashBoxes', [
            'branch' => $branch, 'branches' => $branches, 'started' => $started,
            'boxes' => $this->branchBoxes->rows($branch->id, $actor, $closings->modelKeys()),
            'closings' => $closings,
            'access' => $this->branchBoxes->access($actor, $branch->id),
            ...($actor->can('viewOwnCashBoxes', Subscription::class) ? $this->collectionCounts($actor) : ['pendingCount' => 0]),
            'collectionUrls' => $this->collectionUrls(),
            'urls' => ['index' => route('payments.cash-boxes'), 'actions' => url('/reconciliation/actions'), 'reconciliation' => route('closings.index')],
        ]);
    }

    /**
     * The entries of one of the actor's open boxes, newest first: the type
     * picked with `?open=`, else the first type with an open box. Null
     * entries when no box of that type is open.
     *
     * @param  array<string, array<string, mixed>|null>  $current
     * @return array{type: string, entries: LengthAwarePaginator<int, array<string, mixed>>|null}
     */
    private function openBoxEntries(Request $request, array $current): array
    {
        $open = array_filter($current);
        $type = array_key_exists((string) $request->query('open'), $current) ? (string) $request->query('open') : (array_key_first($open) ?? CashBoxType::Cash->value);
        $box = $current[$type] ?? null;

        return [
            'type' => $type,
            'entries' => $box === null ? null : CashBoxPayment::query()->where('cash_box_id', $box['id'])
                ->with(['transaction.subscription:id,full_name,subscription_name,account_number', 'transaction.recordedBy:id,name'])
                ->orderByDesc('occurred_at')->orderByDesc('id')
                ->paginate(self::OPEN_BOX_ENTRIES, ['*'], 'entries_page')->withQueryString()
                ->through(fn (CashBoxPayment $entry): array => $this->cashBoxEntry($entry)),
        ];
    }

    /**
     * One of the actor's boxes with its entries; `?format=csv` downloads the
     * box's details and every entry as a spreadsheet, and `?print_all=1`
     * lists every entry for the printout.
     */
    public function showCashBox(Request $request, CashBox $cashBox): InertiaResponse|StreamedResponse
    {
        $this->authorize('viewOwnCashBoxes', Subscription::class);
        $actor = $request->user();
        abort_unless($cashBox->user_id === $actor->id && $cashBox->branch_id === $actor->branch_id && $cashBox->kind !== 'direct', 404);
        $this->workflow->refresh($cashBox->branch_id);
        $cashBox->refresh()->loadCount('payments');
        $entryQuery = $cashBox->payments()->with(['transaction.subscription:id,full_name,subscription_name,account_number', 'transaction.recordedBy:id,name'])
            ->orderByDesc('occurred_at')->orderByDesc('id');

        if ($request->query('format') === 'csv') {
            return $this->exportCashBox($cashBox, $entryQuery->get());
        }

        $entries = $entryQuery->paginate($this->dataTablePerPage($request, 25))->withQueryString()->through(fn (CashBoxPayment $entry): array => $this->cashBoxEntry($entry));

        return Inertia::render('Payments/CashBoxShow', [
            'box' => $this->cashBoxRow($cashBox), 'entries' => $entries,
            ...$this->collectionCounts($actor),
            'collectionUrls' => $this->collectionUrls(),
        ]);
    }

    /**
     * One entry of a box: the payment or clearing, who it was for, where
     * its check stands, the payment's receipt, and the transaction as the
     * subscriber's statement shows it.
     *
     * @return array<string, mixed>
     */
    private function cashBoxEntry(CashBoxPayment $entry): array
    {
        return [
            'id' => $entry->id, 'occurredAt' => $entry->occurred_at, 'currency' => $entry->currency,
            'amount' => $entry->amount, 'status' => $entry->status, 'isLate' => $entry->is_late,
            'transactionStatus' => $entry->transaction->status,
            'subscriber' => $entry->transaction->subscription->displayName(),
            'accountNumber' => $entry->transaction->subscription->account_number,
            'voucherNumber' => $entry->transaction->manual_voucher_number ?? $entry->transaction->voucher_number,
            'bankName' => $entry->transaction->bank_name, 'senderBank' => $entry->transaction->sender_bank_name,
            'referenceNumber' => $entry->transaction->reference_number, 'service' => $entry->transaction->notes,
            'receiptUrl' => $entry->transaction->isPayment() || $entry->transaction->isClearing() ? route('subscriptions.payments.receipt', [$entry->transaction->subscription, $entry->transaction]) : null,
            'ledger' => $entry->transaction->ledgerDetails(),
        ];
    }

    /**
     * The box as a spreadsheet: its details on top, then every entry.
     *
     * @param  Collection<int, CashBoxPayment>  $entries
     */
    private function exportCashBox(CashBox $box, Collection $entries): StreamedResponse
    {
        $row = $this->cashBoxRow($box);
        $local = fn (?CarbonInterface $time): string => $time ? $time->copy()->setTimezone(config('app.business_timezone'))->format('Y-m-d H:i') : '';
        $statuses = ['cash' => 'سارية', 'pending' => 'بانتظار التحقق', 'confirmed' => 'مؤكدة', 'missing' => 'غير موجودة في البنك', 'rejected' => 'مرفوضة'];
        $types = ['cash' => 'نقدي', 'bank_transfer' => 'حوالات بنكية', 'clearing' => 'مقاصات'];
        $stages = ['open' => 'مفتوح', 'awaiting_branch' => 'مغلق – بانتظار تأكيد الفرع', 'awaiting_confirmation' => 'استُلم – بانتظار تأكيد التسليم', 'completed' => 'أكّد الفرع إغلاقه'];
        $safe = fn (array $cells): array => array_map(fn ($cell) => is_string($cell) && preg_match('/^[=+@\-\t\r]/u', $cell) ? "'".$cell : $cell, $cells);

        return response()->streamDownload(function () use ($box, $row, $entries, $local, $statuses, $types, $stages, $safe): void {
            $file = fopen('php://output', 'w');
            fwrite($file, "\xEF\xBB\xBF");
            foreach ([
                ['رقم الصندوق', $box->number],
                ['النوع', $types[$box->type->value]],
                ['المحصّل', $box->user?->name ?? ''],
                ['الحالة', $stages[$row['stage']]],
                ['تاريخ الفتح', $local($box->opened_at)],
                ['تاريخ الإغلاق', $local($box->closed_at)],
                ['أغلقه', $row['closedBy'] ?? ''],
                ['الإجمالي ₪', (float) $row['totals']['ILS']],
                ['المبلغ المستلم ₪', (float) $row['receivedAmounts']['ILS']],
                [],
            ] as $cells) {
                fputcsv($file, $safe($cells));
            }
            fputcsv($file, ['#', 'التاريخ والوقت', 'المشترك', 'رقم الحساب', 'رقم السند', 'البنك المستلم', 'البنك المرسل', 'رقم الحوالة', 'الخدمة', 'العملة', 'المبلغ', 'الحالة']);
            foreach ($entries->values() as $index => $entry) {
                $cancelled = $entry->transaction->status !== SubscriptionTransaction::STATUS_ACTIVE;
                fputcsv($file, $safe([
                    $index + 1, $local($entry->occurred_at), $entry->transaction->subscription->displayName(), $entry->transaction->subscription->account_number,
                    $entry->transaction->manual_voucher_number ?? $entry->transaction->voucher_number ?? '', $entry->transaction->bank_name ?? '', $entry->transaction->sender_bank_name ?? '',
                    $entry->transaction->reference_number ?? '', $entry->method === 'clearing' ? ($entry->transaction->notes ?? '') : '', $entry->currency, (float) $entry->amount,
                    $cancelled ? 'ملغاة' : ($statuses[$entry->status] ?? $entry->status),
                ]));
            }
            fclose($file);
        }, 'cash-box-'.$box->number.'.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * The collector's answer to an audit note the branch sent them.
     */
    public function replyToAuditNote(Request $request, int $auditNote): RedirectResponse
    {
        $this->authorize('viewOwnCashBoxes', Subscription::class);
        $data = $request->validate(['body' => ['required', 'string', 'max:3000']]);
        $actor = $request->user();
        abort_unless($actor->branch_id, 403);

        $this->workflow->locked($actor->branch_id, function () use ($actor, $auditNote, $data): void {
            $this->workflow->collectorReply($this->waitingAuditNotes($actor)->findOrFail($auditNote), $actor, $data['body']);
        });

        return back()->with('status', 'audit-note-replied');
    }

    /**
     * The audit notes of the actor's branch waiting on the actor's answer.
     *
     * @return Builder<AuditNote>
     */
    private function waitingAuditNotes(User $actor): Builder
    {
        return AuditNote::query()->where('assigned_to', $actor->id)->where('status', 'with_collector')
            ->whereHas('closing', fn (Builder $query) => $query->where('branch_id', $actor->branch_id));
    }

    private function ownBoxQuery(User $actor): Builder
    {
        return CashBox::query()->where('branch_id', $actor->branch_id)->where('user_id', $actor->id)->where('kind', '!=', 'direct')
            ->withCount('payments')->with(['payments.transaction:id,status', 'receivedBy:id,name', 'receivedIn:id,period_start,period_end'])->latest('id');
    }

    /** @return array{payments: string, summary: string, cashBoxes: string, entries: string} */
    private function collectionUrls(): array
    {
        return ['payments' => route('payments.index'), 'summary' => route('payments.summary'), 'cashBoxes' => route('payments.cash-boxes'), 'entries' => route('payments.entries')];
    }

    /** Whether the actor's branch keeps collector boxes yet. */
    private function boxesStarted(User $actor): bool
    {
        return $actor->branch_id && ClosingSetting::ownFor($actor->branch_id)?->workflow_started_at !== null;
    }

    /**
     * The badge on the collector's pages: what waits on the actor on the
     * summary page (a handover left to confirm, audit notes to answer).
     *
     * @return array{pendingCount: int}
     */
    private function collectionCounts(User $actor): array
    {
        if (! $this->boxesStarted($actor)) {
            return ['pendingCount' => 0];
        }

        return [
            'pendingCount' => $this->ownBoxQuery($actor)->where('type', CashBoxType::Cash)->where('status', 'received')->whereNull('confirmed_at')->count() + $this->waitingAuditNotes($actor)->count(),
        ];
    }

    /**
     * The actor's boxes, with what waits on them: received cash boxes to
     * confirm, audit notes to answer, and the shortfalls they still owe.
     *
     * @return array{started: bool, branchName: ?string, boxes: array<int, array<string, mixed>>, current: array<string, array<string, mixed>|null>, needsAction: array<int, array<string, mixed>>, auditNotes: array<int, array<string, mixed>>, debts: array<int, array<string, mixed>>}
     */
    private function ownCashBoxes(User $actor, bool $includeRecentHistory = true): array
    {
        if (! $this->boxesStarted($actor)) {
            return ['started' => false, 'branchName' => $actor->branch?->name, 'boxes' => [], 'current' => [], 'needsAction' => [], 'auditNotes' => [], 'debts' => []];
        }

        $this->workflow->refresh($actor->branch_id);
        $query = $this->ownBoxQuery($actor);
        $outstanding = (clone $query)->whereNull('confirmed_at')->get();
        $history = $includeRecentHistory ? (clone $query)->whereNotNull('confirmed_at')->limit(10)->get() : collect();
        $rows = $outstanding->concat($history)->map(fn (CashBox $box): array => $this->cashBoxRow($box));

        return [
            'started' => true,
            'branchName' => $actor->branch?->name,
            'boxes' => $rows->values()->all(),
            'current' => collect(CashBoxType::cases())->mapWithKeys(fn (CashBoxType $type): array => [$type->value => $rows->first(fn (array $box): bool => $box['type'] === $type->value && $box['status'] === 'open')])->all(),
            'needsAction' => $rows->filter(fn (array $box): bool => $box['stage'] === 'awaiting_confirmation')->values()->all(),
            'auditNotes' => $this->waitingAuditNotes($actor)->with(['box:id,number', 'closing:id,period_start,period_end', 'replies' => fn ($query) => $query->where('kind', 'collector')->latest('id')])
                ->latest('id')->get()->map(fn (AuditNote $note): array => [
                    'id' => $note->id,
                    'body' => $note->body,
                    'question' => $note->replies->first()?->body,
                    'differences' => $note->differences,
                    'periodStart' => $note->closing->period_start->toDateString(),
                    'periodEnd' => $note->closing->period_end->toDateString(),
                    'box' => $note->box ? ['number' => $note->box->number, 'url' => route('payments.cash-boxes.show', $note->box)] : null,
                    'replyUrl' => route('payments.audit-notes.reply', $note),
                ])->all(),
            'debts' => CollectorDebt::query()->where('user_id', $actor->id)->where('branch_id', $actor->branch_id)->where('remaining', '>', 0)
                ->with('box:id,number')->oldest('id')->get()->map(fn (CollectorDebt $debt): array => [
                    'id' => $debt->id,
                    'currency' => $debt->currency,
                    'amount' => $debt->amount,
                    'remaining' => $debt->remaining,
                    'createdAt' => $debt->created_at,
                    'box' => $debt->box ? ['number' => $debt->box->number, 'url' => route('payments.cash-boxes.show', $debt->box)] : null,
                ])->all(),
        ];
    }

    /** @return array<string, mixed> */
    private function cashBoxRow(CashBox $box): array
    {
        return [
            'id' => $box->id,
            'number' => $box->number,
            'status' => $box->status,
            'type' => $box->type->value,
            'stage' => $box->stage(),
            'totals' => $box->totals(),
            'rejectedCount' => $box->payments->whereIn('status', ['missing', 'rejected'])->filter(fn (CashBoxPayment $entry): bool => $entry->transaction?->status === SubscriptionTransaction::STATUS_ACTIVE)->count(),
            'openedAt' => $box->opened_at,
            'closedAt' => $box->closed_at,
            'receivedAt' => $box->received_at,
            'confirmedAt' => $box->confirmed_at,
            'paymentCount' => $box->payments_count,
            // The branch counts blind, so the count and what it was checked against show only once the box is received.
            ...($box->received_at && $box->type->isCounted() && $box->head_counts ? [
                'expectedCounts' => $box->expected_counts,
                'receivedCounts' => $box->head_counts,
                'differences' => $this->workflow->differences($box->head_counts, $box->expected_counts ?? []),
                'decisions' => $box->decisions ?: null,
            ] : ['expectedCounts' => null, 'receivedCounts' => null, 'differences' => null, 'decisions' => null]),
            'reason' => $box->reason,
            'receivedAmounts' => $this->receivedAmounts($box),
            'closedBy' => $this->closedBy($box),
            'settledIn' => $box->receivedIn ? ['start' => $box->receivedIn->period_start->toDateString(), 'end' => $box->receivedIn->period_end->toDateString()] : null,
            'urls' => [
                'show' => route('payments.cash-boxes.show', $box),
                'confirm' => route('closings.actions', ['action' => 'confirm', 'record' => $box->id]),
                'export' => route('payments.cash-boxes.show', [$box, 'format' => 'csv']),
            ],
            'branchId' => $box->branch_id,
        ];
    }

    /**
     * What the branch took in from the box, by currency: the cash it counted,
     * or the transfers and clearings it confirmed. Nothing before receipt.
     *
     * @return array<string, string>
     */
    private function receivedAmounts(CashBox $box): array
    {
        $none = array_fill_keys(BranchClosingWorkflow::CURRENCIES, '0.00');

        if (! $box->received_at) {
            return $none;
        }

        if ($box->type->isCounted()) {
            return collect($none)->map(fn (string $zero, string $currency): string => Closing::money(Closing::cents($box->head_counts[$currency] ?? 0)))->all();
        }

        $confirmed = $box->payments->where('status', 'confirmed')->filter(fn (CashBoxPayment $entry): bool => $entry->transaction?->status === SubscriptionTransaction::STATUS_ACTIVE);

        return collect($none)->map(fn (string $zero, string $currency): string => Closing::money($confirmed->where('currency', $currency)->sum(fn (CashBoxPayment $entry): int => Closing::cents($entry->amount))))->all();
    }

    /**
     * Who closed the box: the branch member who counted or received it, or
     * what closed it on its own (the weekly cut-off, the collector leaving,
     * a payment synced after its week). Null while it is open.
     */
    private function closedBy(CashBox $box): ?string
    {
        if ($box->status === 'open') {
            return null;
        }

        return $box->receivedBy?->name ?? match ($box->close_reason) {
            'cutoff' => 'تلقائي عند القطع الأسبوعي',
            'departure' => 'تلقائي عند مغادرة المحصّل',
            'late_sync' => 'تلقائي لدفعة متأخرة',
            default => 'الفرع',
        };
    }

    /**
     * The table's search, filters and sort. The search finds a name, account
     * or old number, phone or meter box number; the balance filter sorts
     * those who owe from those settled or in credit.
     *
     * @param  Builder<Subscription>  $query
     */
    private function applyTableFilters(Builder $query, Request $request): void
    {
        $search = $this->searchTerm($request);

        if ($search !== '') {
            $this->applySearch($query, $search);
        }

        $this->applyDataTableFilters($query, $request, [], self::SORTABLE, 'display_name');
        $this->applyDataTableFilterSelects($query, $request, ['status', 'branch_id', 'tariff_id', 'meter_box_id']);
        $this->applyMeterBoxNameFilter($query, $request);
        $this->applySubAreaFilter($query, $request);

        $balance = self::BALANCE_FILTERS[(string) $this->filterValue($request, 'balance')] ?? null;

        if ($balance !== null) {
            $query->whereRaw('(select coalesce(sum(amount), 0) from subscription_transactions where subscription_transactions.subscription_id = subscriptions.id) '.$balance[0].' 0');
        }
    }

    /**
     * The Filter menu's dropdowns: what they owe, status, subscription type,
     * منطقة 2 and meter box — and the branch, for the Super Admin.
     *
     * @return array<int, array{key: string, label: string, options: array<int, array<string, mixed>>}>
     */
    private function filterOptions(User $actor, Request $request): array
    {
        $groups = [
            $this->filterGroup('balance', 'الرصيد', collect(self::BALANCE_FILTERS)->map(fn (array $filter, string $value): array => ['value' => $value, 'label' => $filter[1]])),
            $this->filterGroup('status', 'الحالة', SubscriptionStatus::options()),
            $this->filterGroup('tariff_id', 'نوع الاشتراك', $this->modelOptions(Tariff::orderBy('category')->get(), fn (Tariff $tariff): string => __($tariff->category->label()))),
            $this->subAreaFilterGroup(SubArea::query()->visibleTo($actor)->orderBy('name')->get()),
            ...$this->meterBoxFilterGroupsFor($actor, $request, $actor->isSuperAdmin() ? fn (MeterBox $box): string => $box->branch->name : null),
        ];

        if ($actor->isSuperAdmin()) {
            $groups[] = $this->branchFilterGroup();
        }

        return $groups;
    }

    /**
     * The split payment form's search, as JSON: the subscriptions matching
     * `?search=`, or — with `?siblings_of=` — the other subscriptions under
     * the same identity number as that one, so a payer's accounts are added
     * to the split together.
     */
    public function search(Request $request): JsonResponse
    {
        $this->authorize('recordAnyPayment', Subscription::class);

        $actor = $request->user();
        $siblingsOf = $request->query('siblings_of');

        if (is_string($siblingsOf) && ctype_digit($siblingsOf)) {
            $source = Subscription::query()->visibleTo($actor)->findOrFail($siblingsOf);
            $found = $source->subscriber_profile_id === null ? collect() : Subscription::query()
                ->visibleTo($actor)
                ->with(['branch', 'meterBox', 'circuitBreaker', 'profile'])
                ->withSum('transactions as outstanding_balance', 'amount')
                ->where('subscriber_profile_id', $source->subscriber_profile_id)
                ->whereKeyNot($source->id)
                ->orderBy('account_number')
                ->limit(StoreSplitPaymentRequest::MAX_PARTS)
                ->get();

            return response()->json(['subscriptions' => $found->map(fn (Subscription $subscription): array => $this->row($subscription))->values(), 'hasMore' => false]);
        }

        $search = trim((string) $request->query('search', ''));
        $found = $search === '' ? collect() : $this->matching($actor, $search);

        return response()->json([
            'subscriptions' => $found->take(self::RESULT_LIMIT)->map(fn (Subscription $subscription): array => $this->row($subscription))->values(),
            'hasMore' => $found->count() > self::RESULT_LIMIT,
        ]);
    }

    /**
     * The subscriptions of the user's branch (any branch for the Super Admin)
     * whose name, account name, account or old number or meter box number
     * match every word of the search, or whose phone contains its digits.
     *
     * @return Collection<int, Subscription>
     */
    private function matching(User $actor, string $search): Collection
    {
        return $this->applySearch(Subscription::query()
            ->visibleTo($actor)
            ->with(['branch', 'meterBox', 'circuitBreaker', 'profile'])
            ->withSum('transactions as outstanding_balance', 'amount'), $search)
            ->orderBy('full_name')
            ->limit(self::RESULT_LIMIT + 1)
            ->get();
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

    /**
     * Keep the subscriptions whose name, account name, account or old number
     * or meter box number match every word of the search, or whose phone
     * contains its digits.
     *
     * @param  Builder<Subscription>  $query
     * @return Builder<Subscription>
     */
    private function applySearch(Builder $query, string $search): Builder
    {
        $digits = preg_replace('/\D/', '', $search);

        return $query->where(function (Builder $matching) use ($search, $digits): void {
            $matching->matchingSearch($search);

            if (strlen($digits) >= 3) {
                $matching->orWhere('phone', 'like', '%'.$digits.'%')->orWhere('subscription_phone', 'like', '%'.$digits.'%');
            }
        });
    }

    /**
     * One search result: who, where, and what they owe, in the shape the
     * payment form reads.
     *
     * @return array<string, mixed>
     */
    private function row(Subscription $subscription): array
    {
        return [
            'id' => $subscription->id,
            'fullName' => $subscription->displayName(),
            'accountNumber' => $subscription->account_number,
            'subscriberNumber' => $subscription->profile?->subscriber_number,
            'phone' => $subscription->contactPhone(),
            'meterBoxNumber' => $subscription->meterBox?->box_number,
            'subAreaName' => $subscription->meterBox?->subArea?->name,
            'branchName' => $subscription->branch->name,
            'status' => $subscription->status->value,
            'statusLabel' => __($subscription->status->label()),
            'balance' => number_format((float) ($subscription->outstanding_balance ?? 0), 2, '.', ''),
            'weeklyMinimumPayment' => $subscription->weeklyMinimumPayment(),
        ];
    }

    /**
     * What the user has collected in the current business day: the totals
     * (cancelled payments left out), and their latest payments.
     *
     * @return array{count: int, total: string, cash: string, transfers: string, payments: array<int, array<string, mixed>>}
     */
    private function todaysPayments(User $actor): array
    {
        $periods = ClosingPeriods::for($actor->branch_id);
        $day = $periods->dayOf(now());
        [$from, $until] = $periods->utcRange($day, $day);

        $payments = SubscriptionTransaction::query()
            ->where('type', SubscriptionTransaction::TYPE_PAYMENT)
            ->whereNull('cancelled_at')
            ->where('recorded_by', $actor->id)
            ->where('created_at', '>=', $from)
            ->where('created_at', '<', $until)
            ->with('subscription')
            ->latest('id')
            ->get();

        $sumOf = fn (Collection $lines): string => number_format($lines->sum(fn (SubscriptionTransaction $payment): float => -(float) $payment->amount), 2, '.', '');
        $cash = $payments->filter(fn (SubscriptionTransaction $payment): bool => $payment->payment_method === PaymentMethod::Cash);

        return [
            'count' => $payments->count(),
            'total' => $sumOf($payments),
            'cash' => $sumOf($cash),
            'transfers' => $sumOf($payments->reject(fn (SubscriptionTransaction $payment): bool => $payment->payment_method === PaymentMethod::Cash)),
            'payments' => $payments->take(self::RECENT_PAYMENTS)->map(fn (SubscriptionTransaction $payment): array => [
                'id' => $payment->id,
                'subscriptionName' => $payment->subscription->displayName(),
                'amount' => SubscriptionTransaction::formatAmount(ltrim($payment->amount, '-')),
                'methodLabel' => $payment->payment_method ? __($payment->payment_method->label()) : null,
                'bankName' => $payment->bank_name,
                'voucherNumber' => $payment->displayVoucherNumber(),
                'time' => DailySeries::localTime($payment->created_at),
                'receiptUrl' => route('subscriptions.payments.receipt', [$payment->subscription, $payment]),
            ])->values()->all(),
        ];
    }
}
