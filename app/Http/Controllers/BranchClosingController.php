<?php

namespace App\Http\Controllers;

use App\Enums\CashBoxType;
use App\Http\Requests\BranchClosingActionRequest;
use App\Models\AuditNote;
use App\Models\AuditNoteReply;
use App\Models\CashBox;
use App\Models\CashBoxPayment;
use App\Models\Closing;
use App\Models\ClosingAdjustment;
use App\Models\ClosingSetting;
use App\Models\ClosingSettingChange;
use App\Models\CollectorDebt;
use App\Models\SafeCount;
use App\Models\Subscription;
use App\Models\User;
use App\Support\BranchBoxes;
use App\Support\BranchClosingAccess;
use App\Support\BranchClosingWorkflow;
use App\Support\WeeklyClosingSummary;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class BranchClosingController extends Controller
{
    public function __construct(private BranchClosingWorkflow $workflow, private BranchBoxes $branchBoxes, private WeeklyClosingSummary $summary) {}

    /** The states of an audit note that wait on the branch's answer. */
    private const WAITING_ON_BRANCH = ['awaiting_reply', 'rejected', 'collector_replied'];

    /**
     * Closing management for the branch: the week running and what waits
     * on the branch; every week in a table, each with its totals, where it
     * stands and the audit's notes on it to answer, with the collectors'
     * debts; and the weekly schedule with who may close boxes or submit the
     * week. A week's boxes are reviewed and it is sent from the weekly
     * closing page, so a link to one week here (`?closing_id=`) opens it
     * there.
     */
    public function index(Request $request): Response|RedirectResponse
    {
        $actor = $request->user();
        abort_unless(BranchClosingAccess::view($actor), 403);
        [$branches, $branch] = $this->branchBoxes->branch($request, $actor);
        $branchId = $branch->id;
        if ($request->integer('closing_id')) {
            return redirect()->route('weekly-packages.index', ['branch_id' => $branchId, 'closing_id' => $request->integer('closing_id')]);
        }
        $setting = ClosingSetting::forBranch($branchId);
        $started = $setting->workflow_started_at !== null;
        if ($started) {
            $this->workflow->refresh($branchId);
            $setting = ClosingSetting::forBranch($branchId);
        }
        $closings = $this->branchBoxes->closings($branchId);
        $boxRows = $this->branchBoxes->rows($branchId, $actor);
        $current = $started ? $this->workflow->current($branchId) : null;
        $pendingChange = ClosingSettingChange::query()->where('branch_id', $branchId)->whereNull('applied_at')->latest('id')->first();
        $notes = AuditNote::query()->whereIn('closing_id', Closing::query()->where('branch_id', $branchId)->select('id'))->with(['closing:id,number,coverage_from,coverage_until,workflow_settings', 'replies.user:id,name', 'box:id,number,type,user_id', 'box.user:id,name', 'entry.transaction.subscription:id,full_name,subscription_name,account_number', 'entry.transaction.recordedBy:id,name'])->latest('id')->get();

        return Inertia::render('Closings/Index', [
            'branch' => $branch, 'branches' => $branches, 'started' => $started, 'actorId' => $actor->id,
            'settings' => $this->workflow->settings($setting), 'receivers' => $setting->receivers ?? [], 'approvers' => $setting->approvers ?? [],
            'pendingChange' => $pendingChange, 'transitionUntil' => $current ? $this->workflow->nextEnd($current->scheduled_until, $pendingChange?->settings ?? $this->workflow->settings($setting))->toIso8601String() : null,
            'current' => $current, 'closings' => $closings->map(fn (Closing $closing): array => [...$closing->toArray(), 'submitted_snapshot' => $closing->submitted_snapshot ? true : null]),
            'weeks' => $this->weeks($closings, $notes),
            'boxes' => $boxRows,
            'debts' => CollectorDebt::query()->where('branch_id', $branchId)->with('user:id,name')->where('remaining', '>', 0)->get(),
            'adjustments' => ClosingAdjustment::query()->where(fn ($query) => $query->whereIn('closing_id', $closings->modelKeys())->orWhereIn('original_closing_id', $closings->modelKeys()))->get(),
            'safeCounts' => SafeCount::query()->whereIn('closing_id', $closings->modelKeys())->get(),
            'notes' => $notes->map(fn (AuditNote $note): array => $this->presentNote($note, $branchId))->values(),
            'staff' => User::query()->where('branch_id', $branchId)->where('is_active', true)->get(['id', 'name', 'role'])
                ->map(fn (User $user): array => ['id' => $user->id, 'name' => $user->name, 'isBranchAdmin' => $user->isBranchAdmin()]),
            'access' => $this->branchBoxes->access($actor, $branchId),
            'urls' => ['index' => route('closings.index'), 'weekly' => route('weekly-packages.index'), 'boxes' => route('payments.cash-boxes'), 'actions' => url('/reconciliation/actions'), 'proofs' => url('/reconciliation/proofs')],
        ]);
    }

    /**
     * The branch's weeks, newest first, each with where it stands, its
     * boxes, entries and totals as the weekly closing page counts them, when
     * the branch sent it, and how many audit notes it has, how many of
     * them are still open and how many of those wait on the branch.
     *
     * @param  EloquentCollection<int, Closing>  $closings
     * @param  EloquentCollection<int, AuditNote>  $notes
     * @return list<array<string, mixed>>
     */
    private function weeks(EloquentCollection $closings, EloquentCollection $notes): array
    {
        $closings->loadCount('auditNotes');

        return $closings->map(function (Closing $closing) use ($notes): array {
            $totals = $this->summary->totals($this->summary->boxes($closing));
            $own = $notes->where('closing_id', $closing->id);

            return [
                ...$closing->only(['id', 'coverage_from', 'coverage_until', 'is_manual', 'workflow_settings']),
                'status' => $closing->status->value,
                'step' => $this->summary->step($closing),
                'sentAt' => $closing->branch_approved_at ?? $closing->submitted_at,
                'boxes' => $totals['boxes'],
                'entries' => $totals['entries'],
                'amounts' => $totals['amounts'],
                'notes' => $own->count(),
                'waitingNotes' => $own->whereIn('status', self::WAITING_ON_BRANCH)->count(),
                'openNotes' => $own->where('status', '!=', 'closed')->count(),
            ];
        })->values()->all();
    }

    /**
     * An audit note as the weeks table lists it: the entry it is about, as
     * the subscriber's statement shows it, with its box, whose box it is and
     * who recorded it, or the box it is about when it is about a whole box.
     *
     * @return array<string, mixed>
     */
    private function presentNote(AuditNote $note, int $branchId): array
    {
        $entry = $note->entry;
        $transaction = $entry?->transaction;

        return [
            ...$note->only(['id', 'closing_id', 'cash_box_id', 'cash_box_payment_id', 'body', 'status', 'differences', 'difference_decisions', 'created_at']),
            'closing' => $note->closing,
            'replies' => $note->replies,
            'box' => $note->box ? [
                'id' => $note->box->id, 'number' => $note->box->number, 'type' => $note->box->type->value, 'person' => $note->box->user?->name,
                'url' => route('weekly-packages.index', ['branch_id' => $branchId, 'closing_id' => $note->closing_id, 'box' => $note->box->id]),
            ] : null,
            'entry' => $transaction ? [
                'id' => $entry->id, 'amount' => $entry->amount, 'currency' => $entry->currency, 'status' => $entry->status,
                'subscriber' => $transaction->subscription->displayName(), 'accountNumber' => $transaction->subscription->account_number,
                'statementUrl' => route('subscriptions.statement', $transaction->subscription),
                'ledger' => $transaction->ledgerDetails(),
            ] : null,
        ];
    }

    public function action(BranchClosingActionRequest $request, string $action, ?int $record = null): RedirectResponse
    {
        $actor = $request->user();
        $branchId = $request->integer('branch_id');
        abort_unless($actor->isSuperAdmin() || $actor->branch_id === $branchId, 404);
        $data = $request->validated();
        $allowed = match ($action) {
            'confirm' => $actor->is_active && $actor->can('viewOwnCashBoxes', Subscription::class),
            'receive', 'receive-type', 'electronic', 'repay' => BranchClosingAccess::receive($actor, $branchId),
            'submit', 'early', 'reply' => BranchClosingAccess::approve($actor, $branchId),
            'start', 'settings' => BranchClosingAccess::manage($actor, $branchId),
            default => false,
        };
        abort_unless($allowed, 403);
        $this->workflow->locked($branchId, function () use ($request, $action, $record, $actor, $branchId, $data): void {
            if ($action === 'start') {
                $this->workflow->start($branchId, $actor);

                return;
            }
            $this->workflow->refresh($branchId);
            abort_unless(ClosingSetting::ownFor($branchId)?->workflow_started_at, 404);
            if (in_array($action, ['receive', 'confirm'], true)) {
                $box = CashBox::query()->where('branch_id', $branchId)->findOrFail($record);
                match ($action) {
                    'receive' => $this->workflow->receive($box, $actor, $request->boolean('cash_counted')),
                    'confirm' => $this->workflow->confirmBox($box, $actor),
                };
            } elseif ($action === 'receive-type') {
                $this->workflow->receiveType($branchId, $actor, CashBoxType::from($data['type']), array_map('intval', $data['box_ids']), $request->boolean('cash_counted'));
            } elseif ($action === 'electronic') {
                $payment = CashBoxPayment::query()->whereHas('box', fn ($query) => $query->where('branch_id', $branchId))->findOrFail($record);
                $this->workflow->reviewEntry($payment, $actor, $data['status']);
            } elseif ($action === 'settings') {
                $this->workflow->changeSettings($branchId, $actor, $data);
            } elseif ($action === 'repay') {
                $this->workflow->repay(CollectorDebt::query()->where('branch_id', $branchId)->findOrFail($record), $actor, (string) $data['amount']);
            } elseif ($action === 'reply') {
                $note = AuditNote::query()->whereHas('closing', fn ($query) => $query->where('branch_id', $branchId))->findOrFail($record);
                $path = $request->file('document')?->store('closing-documents', 'local');
                try {
                    $this->workflow->reply($note, $actor, $data, $path);
                } catch (\Throwable $exception) {
                    if ($path) {
                        Storage::disk('local')->delete($path);
                    }
                    throw $exception;
                }
            } else {
                $closing = Closing::query()->where('branch_id', $branchId)->whereNotNull('workflow_settings')->findOrFail($record);
                match ($action) {
                    'submit' => $this->workflow->submit($closing, $actor, $data['notes'] ?? null),
                    'early' => $this->workflow->earlyClose($closing),
                };
            }
        });

        return back()->with('status', 'تم حفظ الإجراء بنجاح.');
    }

    public function proof(Request $request, string $kind, int $record): StreamedResponse
    {
        abort_unless($kind === 'reply', 404);
        $item = AuditNoteReply::query()->findOrFail($record);
        $branchId = AuditNote::query()->findOrFail($item->audit_note_id)->closing->branch_id;
        $path = $item->document_path;
        $actor = $request->user();
        abort_unless(BranchClosingAccess::view($actor) && ($actor->isSuperAdmin() || $actor->branch_id === $branchId), 404);
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->download($path);
    }
}
