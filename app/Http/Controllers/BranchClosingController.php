<?php

namespace App\Http\Controllers;

use App\Http\Requests\BranchClosingActionRequest;
use App\Models\AuditNote;
use App\Models\AuditNoteReply;
use App\Models\Branch;
use App\Models\CashBox;
use App\Models\CashBoxPayment;
use App\Models\CashTransfer;
use App\Models\Closing;
use App\Models\ClosingAdjustment;
use App\Models\ClosingSetting;
use App\Models\ClosingSettingChange;
use App\Models\ClosingVersion;
use App\Models\CollectorDebt;
use App\Models\SafeCount;
use App\Models\Subscription;
use App\Models\User;
use App\Support\BranchClosingAccess;
use App\Support\BranchClosingWorkflow;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class BranchClosingController extends Controller
{
    public function __construct(private BranchClosingWorkflow $workflow) {}

    public function index(Request $request): Response
    {
        $actor = $request->user();
        abort_unless(BranchClosingAccess::view($actor), 403);
        $branches = $actor->isSuperAdmin() ? Branch::query()->orderBy('name')->get(['id', 'name']) : Branch::query()->whereKey($actor->branch_id)->get(['id', 'name']);
        $branchId = $actor->isSuperAdmin() ? ($request->integer('branch_id') ?: $branches->first()?->id) : $actor->branch_id;
        $branch = $branches->firstWhere('id', $branchId);
        abort_unless($branch, 404);
        $setting = ClosingSetting::forBranch($branchId);
        $started = $setting->workflow_started_at !== null;
        if ($started) {
            $this->workflow->refresh($branchId);
            $setting = ClosingSetting::forBranch($branchId);
        }
        $closings = Closing::query()->where('branch_id', $branchId)->whereNotNull('workflow_settings')->withCount(['auditNotes as open_notes_count' => fn ($query) => $query->where('status', '!=', 'closed')])->orderByDesc('coverage_from')->orderBy('id')->limit(60)->get();
        $boxes = CashBox::query()->where('branch_id', $branchId)
            ->where(fn ($query) => $query->whereIn('closing_id', $closings->modelKeys())->orWhere('status', '!=', 'received')->orWhereHas('payments', fn ($payments) => $payments->whereIn('status', ['pending', 'missing', 'rejected'])))
            ->with(['user:id,name', 'payments.transaction:id,subscription_id,reference_number,bank_name,notes,status', 'payments.transaction.subscription:id,full_name,subscription_name,account_number'])->latest('id')->get();
        $boxRows = $boxes->map(function (CashBox $box) use ($actor): array {
            $row = $box->toArray();
            $row['expected_counts'] = ($box->head_counts && $box->received_by === $actor->id) || $box->received_at || ($box->collector_counts && $box->user_id === $actor->id) ? $box->expected_counts : null;
            if (! $box->head_counts && ! $box->received_at && $box->user_id !== $actor->id) {
                $row['collector_counts'] = null;
                if ($box->type->isCounted() && $box->status === 'pending') {
                    $row['payments'] = array_map(fn (array $entry): array => [...$entry, 'amount' => null], $row['payments']);
                }
            }
            $row['canCount'] = BranchClosingAccess::receive($actor, $box->branch_id) && $box->user_id !== $actor->id;
            $row['isOwn'] = $box->user_id === $actor->id;
            $row['stage'] = $box->stage();
            $row['collectorCounted'] = $box->collector_submitted_at !== null;
            $row['payments'] = array_map(fn (array $entry): array => [...$entry, 'statement_url' => route('subscriptions.statement', $entry['transaction']['subscription_id'])], $row['payments']);

            return $row;
        });
        $current = $started ? $this->workflow->current($branchId) : null;
        $pendingChange = ClosingSettingChange::query()->where('branch_id', $branchId)->whereNull('applied_at')->latest('id')->first();
        $selected = $request->integer('closing_id') ? $closings->firstWhere('id', $request->integer('closing_id')) : null;
        if ($request->integer('closing_id')) {
            abort_unless($selected, 404);
        }
        $notes = AuditNote::query()->whereIn('closing_id', Closing::query()->where('branch_id', $branchId)->select('id'))->with(['closing:id,number', 'replies.user:id,name'])->latest('id')->get();

        return Inertia::render('Closings/Index', [
            'branch' => $branch, 'branches' => $branches, 'started' => $started, 'actorId' => $actor->id,
            'settings' => $this->workflow->settings($setting), 'receivers' => $setting->receivers ?? [], 'approvers' => $setting->approvers ?? [],
            'pendingChange' => $pendingChange, 'transitionUntil' => $current ? $this->workflow->nextEnd($current->scheduled_until, $pendingChange?->settings ?? $this->workflow->settings($setting))->toIso8601String() : null,
            'current' => $current, 'closings' => $closings->map(fn (Closing $closing): array => [...$closing->toArray(), 'submitted_snapshot' => $closing->id === $selected?->id ? $closing->submitted_snapshot : ($closing->submitted_snapshot ? true : null), 'blockers' => $closing->submitted_snapshot ? [] : $this->workflow->blockers($closing), 'summary' => $closing->id === $selected?->id ? $this->workflow->reviewSummary($closing) : null]),
            'boxes' => $boxRows, 'safeBalance' => $started ? $this->workflow->balance($branchId) : array_fill_keys(BranchClosingWorkflow::CURRENCIES, '0.00'),
            'transfers' => CashTransfer::query()->where('branch_id', $branchId)->whereHas('closing', fn ($query) => $query->whereNotNull('workflow_settings'))->with('recipient:id,name')->latest('id')->get(),
            'debts' => CollectorDebt::query()->where('branch_id', $branchId)->with('user:id,name')->where('remaining', '>', 0)->get(),
            'adjustments' => ClosingAdjustment::query()->whereIn('closing_id', $closings->modelKeys())->get(),
            'safeCounts' => SafeCount::query()->whereIn('closing_id', $closings->modelKeys())->get(), 'notes' => $notes,
            'versions' => $selected ? ClosingVersion::query()->where('closing_id', $selected->id)->orderByDesc('version')->get() : [],
            'selectedClosingId' => $selected?->id, 'staff' => User::query()->where('branch_id', $branchId)->where('is_active', true)->get(['id', 'name']),
            'recipients' => User::query()->where('is_active', true)->whereIn('role', ['accountant', 'financial_auditor', 'super_admin'])->get(['id', 'name']),
            'access' => ['manage' => BranchClosingAccess::manage($actor, $branchId), 'receive' => BranchClosingAccess::receive($actor, $branchId), 'approve' => BranchClosingAccess::approve($actor, $branchId)],
            'urls' => ['index' => route('closings.index'), 'actions' => url('/reconciliation/actions'), 'proofs' => url('/reconciliation/proofs'), 'transferReceipts' => url('/reconciliation/transfer-receipts')],
        ]);
    }

    public function action(BranchClosingActionRequest $request, string $action, ?int $record = null): RedirectResponse
    {
        $actor = $request->user();
        $branchId = $request->integer('branch_id');
        abort_unless($actor->isSuperAdmin() || $actor->branch_id === $branchId, 404);
        $data = $request->validated();
        $allowed = match ($action) {
            'close', 'collector-count', 'confirm' => $actor->is_active && $actor->can('viewOwnCashBoxes', Subscription::class),
            'head-count', 'receive', 'electronic', 'repay' => BranchClosingAccess::receive($actor, $branchId),
            'submit', 'withdraw', 'safe-count', 'early', 'reply', 'transfer' => BranchClosingAccess::approve($actor, $branchId),
            'start', 'settings', 'direct' => BranchClosingAccess::manage($actor, $branchId),
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
            if (in_array($action, ['close', 'collector-count', 'head-count', 'receive', 'confirm'], true)) {
                $box = CashBox::query()->where('branch_id', $branchId)->findOrFail($record);
                match ($action) {
                    'close' => $this->workflow->closeByCollector($box, $actor, $data),
                    'collector-count' => $this->workflow->countCollector($box, $actor, $data),
                    'head-count' => $this->workflow->countHead($box, $actor, $data),
                    'receive' => $this->workflow->receive($box, $actor, $data),
                    'confirm' => $this->workflow->confirmBox($box, $actor),
                };
            } elseif ($action === 'electronic') {
                $payment = CashBoxPayment::query()->whereHas('box', fn ($query) => $query->where('branch_id', $branchId))->findOrFail($record);
                $this->workflow->reviewEntry($payment, $actor, $data['status']);
            } elseif ($action === 'direct') {
                $payment = CashBoxPayment::query()->whereHas('box', fn ($query) => $query->where('branch_id', $branchId))->findOrFail($record);
                $this->workflow->direct($payment);
            } elseif ($action === 'settings') {
                $this->workflow->changeSettings($branchId, $actor, $data);
            } elseif ($action === 'repay') {
                $this->workflow->repay(CollectorDebt::query()->where('branch_id', $branchId)->findOrFail($record), $actor, (string) $data['amount']);
            } elseif ($action === 'transfer') {
                $path = $request->file('proof')->store('closing-proofs', 'local');
                try {
                    $this->workflow->transfer($branchId, $actor, $data, $path);
                } catch (\Throwable $exception) {
                    Storage::disk('local')->delete($path);
                    throw $exception;
                }
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
                    'withdraw' => $this->workflow->withdraw($closing, $actor),
                    'safe-count' => $this->workflow->safeCount($closing, $actor, $data),
                    'early' => $this->workflow->earlyClose($closing),
                };
            }
        });

        return back()->with('status', 'تم حفظ الإجراء بنجاح.');
    }

    public function proof(Request $request, string $kind, int $record): StreamedResponse
    {
        if ($kind === 'transfer') {
            $item = CashTransfer::query()->findOrFail($record);
            $branchId = $item->branch_id;
            $path = $item->proof_path;
        } else {
            abort_unless($kind === 'reply', 404);
            $item = AuditNoteReply::query()->findOrFail($record);
            $branchId = AuditNote::query()->findOrFail($item->audit_note_id)->closing->branch_id;
            $path = $item->document_path;
        }
        $actor = $request->user();
        abort_unless(BranchClosingAccess::view($actor) && ($actor->isSuperAdmin() || $actor->branch_id === $branchId), 404);
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->download($path);
    }

    public function transferReceipt(Request $request, CashTransfer $transfer): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor->is_active && $transfer->recipient_id === $actor->id && $transfer->sent_by !== $actor->id, 404);
        $this->workflow->locked($transfer->branch_id, function () use ($transfer, $actor): void {
            $transfer->refresh();
            $this->workflow->require($transfer->status->value === 'in_transit', 'التسليم مؤكد بالفعل.');
            $transfer->update(['status' => 'received', 'received_by' => $actor->id, 'received_at' => now()]);
        });

        return back()->with('status', 'تم تأكيد استلام التسليم.');
    }
}
