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
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class BranchClosingController extends Controller
{
    public function __construct(private BranchClosingWorkflow $workflow, private BranchBoxes $branchBoxes) {}

    /**
     * The branch's safe and statements: the week running, the safe and its
     * deliveries, the list of weeks, audit's notes and the settings. A week
     * itself is reviewed and sent from the weekly closing page, so a link
     * to one week here (`?closing_id=`) opens it there.
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
        $boxRows = $this->branchBoxes->rows($branchId, $actor, $closings->modelKeys());
        $current = $started ? $this->workflow->current($branchId) : null;
        $pendingChange = ClosingSettingChange::query()->where('branch_id', $branchId)->whereNull('applied_at')->latest('id')->first();
        $notes = AuditNote::query()->whereIn('closing_id', Closing::query()->where('branch_id', $branchId)->select('id'))->with(['closing:id,number', 'replies.user:id,name'])->latest('id')->get();

        return Inertia::render('Closings/Index', [
            'branch' => $branch, 'branches' => $branches, 'started' => $started, 'actorId' => $actor->id,
            'settings' => $this->workflow->settings($setting), 'receivers' => $setting->receivers ?? [], 'approvers' => $setting->approvers ?? [],
            'pendingChange' => $pendingChange, 'transitionUntil' => $current ? $this->workflow->nextEnd($current->scheduled_until, $pendingChange?->settings ?? $this->workflow->settings($setting))->toIso8601String() : null,
            'current' => $current, 'closings' => $closings->map(fn (Closing $closing): array => [...$closing->toArray(), 'submitted_snapshot' => $closing->submitted_snapshot ? true : null]),
            'boxes' => $boxRows,
            'debts' => CollectorDebt::query()->where('branch_id', $branchId)->with('user:id,name')->where('remaining', '>', 0)->get(),
            'adjustments' => ClosingAdjustment::query()->whereIn('closing_id', $closings->modelKeys())->get(),
            'safeCounts' => SafeCount::query()->whereIn('closing_id', $closings->modelKeys())->get(), 'notes' => $notes,
            'staff' => User::query()->where('branch_id', $branchId)->where('is_active', true)->get(['id', 'name']),
            'access' => $this->branchBoxes->access($actor, $branchId),
            'urls' => ['index' => route('closings.index'), 'weekly' => route('weekly-packages.index'), 'boxes' => route('payments.cash-boxes'), 'actions' => url('/reconciliation/actions'), 'proofs' => url('/reconciliation/proofs')],
        ]);
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
            'submit', 'withdraw', 'early', 'reply' => BranchClosingAccess::approve($actor, $branchId),
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
                    'withdraw' => $this->workflow->withdraw($closing, $actor),
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
