<?php

namespace App\Http\Controllers;

use App\Http\Requests\BoxAuditActionRequest;
use App\Models\Branch;
use App\Models\CashBox;
use App\Support\BranchBoxes;
use App\Support\BranchClosingAccess;
use App\Support\BranchClosingWorkflow;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The audit of the boxes the branches send, one box at a time: every box
 * sent, by the branch that sent it, to open, approve (charging the branch
 * a debt for it if need be) or send back with a note.
 */
class BoxAuditController extends Controller
{
    /** Where a sent box stands in audit, in the order the page's tabs show them. */
    public const STATUSES = ['waiting', 'reviewing', 'returned', 'approved'];

    /** How many approved boxes the approved tab lists, newest first. */
    private const APPROVED_SHOWN = 200;

    public function __construct(private BranchClosingWorkflow $workflow, private BranchBoxes $branchBoxes) {}

    /**
     * The boxes sent to audit in one state (`?status=`, those waiting by
     * default), of one branch (`?branch_id=`) or all, oldest sent first so
     * the audit works through them in turn (approved ones newest first),
     * with how many each branch and each state hold. `?box=` opens a box.
     */
    public function index(Request $request): Response
    {
        abort_unless(BranchClosingAccess::audit($request->user()), 403);
        $status = in_array($request->query('status'), [...self::STATUSES, 'all'], true) ? $request->query('status') : 'waiting';
        $branches = Branch::query()->orderBy('name')->get(['id', 'name']);
        $branchId = $branches->contains('id', $request->integer('branch_id')) ? $request->integer('branch_id') : null;
        $sent = fn (): Builder => CashBox::query()->whereNotNull('sent_at')->when($branchId, fn (Builder $query) => $query->where('branch_id', $branchId));
        $boxes = $sent()->when($status !== 'all', fn (Builder $query) => $query->where('audit_status', $status))
            ->when(in_array($status, ['approved', 'all'], true), fn (Builder $query) => $query->orderByDesc('sent_at')->limit(self::APPROVED_SHOWN), fn (Builder $query) => $query->orderBy('sent_at'))
            ->orderBy('id')->with([...BranchClosingWorkflow::BOX_DETAILS, ...BranchBoxes::PEOPLE_AND_NOTES])->get();
        $asked = $request->integer('box');
        if ($asked && ! $boxes->contains('id', $asked)) {
            $boxes->push(...$sent()->whereKey($asked)->with([...BranchClosingWorkflow::BOX_DETAILS, ...BranchBoxes::PEOPLE_AND_NOTES])->get());
        }
        $ledgers = $this->branchBoxes->ledgers($boxes->flatMap(fn (CashBox $box) => $box->payments->pluck('subscription_transaction_id'))->all());
        $waiting = CashBox::query()->whereNotNull('sent_at')->where('audit_status', 'waiting')->selectRaw('branch_id, count(*) as boxes')->groupBy('branch_id')->pluck('boxes', 'branch_id');

        return Inertia::render('BoxAudit/Index', [
            'boxes' => $boxes->map(fn (CashBox $box): array => [...$this->branchBoxes->present($box, $ledgers), 'branchName' => $branches->firstWhere('id', $box->branch_id)?->name])->values(),
            'branches' => $branches->map(fn (Branch $branch): array => ['id' => $branch->id, 'name' => $branch->name, 'waiting' => (int) ($waiting[$branch->id] ?? 0)])->values(),
            'counts' => collect(self::STATUSES)->mapWithKeys(fn (string $state): array => [$state => $sent()->where('audit_status', $state)->count()])->all(),
            'filters' => ['status' => $status, 'branch_id' => $branchId],
            'urls' => ['index' => route('box-audit.index'), 'actions' => url('/box-audit')],
        ]);
    }

    /** The auditor opens a box (`start`), approves it, or sends it back to its branch with a note. */
    public function action(BoxAuditActionRequest $request, CashBox $cashBox, string $action): RedirectResponse
    {
        $actor = $request->user();
        abort_unless(BranchClosingAccess::audit($actor) && $cashBox->sent_at !== null, 403);
        $data = $request->validated();
        $this->workflow->locked($cashBox->branch_id, function () use ($action, $cashBox, $actor, $data): void {
            $box = CashBox::query()->lockForUpdate()->findOrFail($cashBox->id);
            match ($action) {
                'start' => $this->workflow->startAudit($box, $actor),
                'approve' => $this->workflow->approveAudit($box, $actor, isset($data['debt']) ? (string) $data['debt'] : null, $data['debt_reason'] ?? null),
                'return' => $this->workflow->returnAudit($box, $actor, $data['body'], array_map('intval', $data['entry_ids'] ?? [])),
            };
        });

        return back()->with('status', 'تم حفظ الإجراء بنجاح.');
    }
}
