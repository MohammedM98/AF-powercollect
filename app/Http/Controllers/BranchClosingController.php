<?php

namespace App\Http\Controllers;

use App\Http\Requests\BranchClosingActionRequest;
use App\Models\AuditNote;
use App\Models\AuditNoteReply;
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

    public function index(Request $request): Response
    {
        $actor = $request->user();
        abort_unless(BranchClosingAccess::view($actor), 403);
        [$branches, $branch] = $this->branchBoxes->branch($request, $actor);
        $branchId = $branch->id;
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
        $selected = $request->integer('closing_id') ? $closings->firstWhere('id', $request->integer('closing_id')) : null;
        if ($request->integer('closing_id')) {
            abort_unless($selected, 404);
        }
        $package = $selected ? ($selected->submitted_snapshot ?? ($started ? $this->workflow->snapshot($selected) : null)) : null;
        $packageRows = $package ? $this->presentPackage($package, $actor, $selected->submitted_snapshot !== null) : null;
        $notes = AuditNote::query()->whereIn('closing_id', Closing::query()->where('branch_id', $branchId)->select('id'))->with(['closing:id,number', 'replies.user:id,name'])->latest('id')->get();

        return Inertia::render('Closings/Index', [
            'branch' => $branch, 'branches' => $branches, 'started' => $started, 'actorId' => $actor->id,
            'settings' => $this->workflow->settings($setting), 'receivers' => $setting->receivers ?? [], 'approvers' => $setting->approvers ?? [],
            'pendingChange' => $pendingChange, 'transitionUntil' => $current ? $this->workflow->nextEnd($current->scheduled_until, $pendingChange?->settings ?? $this->workflow->settings($setting))->toIso8601String() : null,
            'current' => $current, 'closings' => $closings->map(fn (Closing $closing): array => [...$closing->toArray(), 'submitted_snapshot' => $closing->id === $selected?->id && $closing->submitted_snapshot ? $packageRows : ($closing->submitted_snapshot ? true : null), 'blockers' => $closing->submitted_snapshot ? [] : $this->workflow->blockers($closing), 'summary' => $closing->id === $selected?->id ? $this->workflow->reviewSummary($closing, $package) : null, 'warnings' => $closing->submitted_snapshot ? ($closing->submitted_snapshot['warnings'] ?? []) : ($closing->id === $selected?->id ? ($package['warnings'] ?? []) : [])]),
            'package' => $packageRows, 'warnings' => $package['warnings'] ?? [],
            'holdsCash' => $started && $this->workflow->holdsCash($branchId),
            'boxes' => $boxRows, 'safeBalance' => $started ? $this->workflow->balance($branchId) : array_fill_keys(BranchClosingWorkflow::CURRENCIES, '0.00'),
            'transfers' => CashTransfer::query()->where('branch_id', $branchId)->whereHas('closing', fn ($query) => $query->whereNotNull('workflow_settings'))->with('recipient:id,name')->latest('id')->get(),
            'debts' => CollectorDebt::query()->where('branch_id', $branchId)->with('user:id,name')->where('remaining', '>', 0)->get(),
            'adjustments' => ClosingAdjustment::query()->whereIn('closing_id', $closings->modelKeys())->get(),
            'safeCounts' => SafeCount::query()->whereIn('closing_id', $closings->modelKeys())->get(), 'notes' => $notes,
            'versions' => $selected ? ClosingVersion::query()->where('closing_id', $selected->id)->orderByDesc('version')->get()->map(fn (ClosingVersion $version): array => [...$version->toArray(), 'snapshot' => $this->presentPackage($version->snapshot, $actor, true)]) : [],
            'selectedClosingId' => $selected?->id, 'staff' => User::query()->where('branch_id', $branchId)->where('is_active', true)->get(['id', 'name']),
            'recipients' => User::query()->where('is_active', true)->whereIn('role', ['accountant', 'financial_auditor', 'super_admin'])->get(['id', 'name']),
            'access' => $this->branchBoxes->access($actor, $branchId),
            'urls' => ['index' => route('closings.index'), 'boxes' => route('payments.cash-boxes.branch'), 'actions' => url('/reconciliation/actions'), 'proofs' => url('/reconciliation/proofs'), 'transferReceipts' => url('/reconciliation/transfer-receipts')],
        ]);
    }

    /** @param array<string, mixed> $package @return array<string, mixed> */
    private function presentPackage(array $package, User $actor, bool $frozen): array
    {
        $boxIds = collect([...($package['boxes'] ?? []), ...($package['carriedIn'] ?? []), ...($package['carriedOut']['boxes'] ?? [])])->pluck('id')->unique();
        $liveBoxes = $frozen ? collect() : CashBox::query()->whereIn('id', $boxIds)->with('user.permissions')->get()->keyBy('id');
        $entries = collect([...($package['boxes'] ?? []), ...($package['carriedIn'] ?? []), ...($package['carriedOut']['boxes'] ?? [])])->flatMap(fn (array $box) => $box['payments'] ?? [])
            ->concat([...($package['carriedOut']['entries'] ?? []), ...($package['electronic'] ?? []), ...($package['clearings'] ?? [])]);
        $ledgers = $this->branchBoxes->ledgers($entries->pluck('subscription_transaction_id')->all());
        $presentEntry = fn (array $entry): array => $this->branchBoxes->presentEntry($entry, $ledgers);
        $presentBox = function (array $box) use ($actor, $frozen, $liveBoxes, $presentEntry): array {
            $live = $liveBoxes->get($box['id']);
            $box['isOwn'] = ($box['user_id'] ?? null) === $actor->id;
            $box['canCount'] = ! $frozen && $live && $this->workflow->mayReceive($live, $actor);
            $box['frozen'] = $frozen;
            $box['payments'] = array_map($presentEntry, $box['payments'] ?? []);
            unset($box['user']['permissions']);

            return $box;
        };
        $package['boxes'] = array_map($presentBox, $package['boxes'] ?? []);
        $package['carriedIn'] = array_map($presentBox, $package['carriedIn'] ?? []);
        $package['carriedOut'] = ['boxes' => array_map($presentBox, $package['carriedOut']['boxes'] ?? []), 'entries' => array_map($presentEntry, $package['carriedOut']['entries'] ?? [])];
        foreach (['electronic', 'clearings'] as $key) {
            $package[$key] = array_map($presentEntry, $package[$key] ?? []);
        }

        return $package;
    }

    public function action(BranchClosingActionRequest $request, string $action, ?int $record = null): RedirectResponse
    {
        $actor = $request->user();
        $branchId = $request->integer('branch_id');
        abort_unless($actor->isSuperAdmin() || $actor->branch_id === $branchId, 404);
        $data = $request->validated();
        $allowed = match ($action) {
            'confirm' => $actor->is_active && $actor->can('viewOwnCashBoxes', Subscription::class),
            'receive', 'electronic', 'repay' => BranchClosingAccess::receive($actor, $branchId),
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
            if (in_array($action, ['receive', 'confirm'], true)) {
                $box = CashBox::query()->where('branch_id', $branchId)->findOrFail($record);
                match ($action) {
                    'receive' => $this->workflow->receive($box, $actor, $request->boolean('cash_counted')),
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
