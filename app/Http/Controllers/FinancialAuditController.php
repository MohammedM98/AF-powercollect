<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\Closing;
use App\Models\FinancialAuditEvent;
use App\Models\FinancialAuditLine;
use App\Models\FinancialAuditStatement;
use App\Support\FinancialAuditService;
use App\Support\WeeklyClosingService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class FinancialAuditController extends Controller
{
    public function index(Request $request): Response
    {
        Gate::authorize('viewAny', FinancialAuditStatement::class);

        return $this->listing($request, false);
    }

    public function branchIndex(Request $request): Response
    {
        Gate::authorize('viewBranchStatements', FinancialAuditStatement::class);

        return $this->listing($request, true);
    }

    private function listing(Request $request, bool $branchView): Response
    {
        $filters = $request->validate([
            'branch' => ['nullable', 'integer'],
            'type' => ['nullable', Rule::in(['daily', 'weekly', 'monthly'])],
            'status' => ['nullable', Rule::in(['pending', 'under_audit', 'returned', 'audited'])],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', ...($request->filled('from') ? ['after_or_equal:from'] : [])],
        ]);
        $actor = $request->user();
        $branches = Branch::query()->when($branchView && ! $actor->isSuperAdmin(), fn (Builder $query): Builder => $query->whereKey($actor->branch_id))->orderBy('name')->get(['id', 'name']);
        $query = FinancialAuditStatement::query()->whereIn('branch_id', $branches->pluck('id'))
            ->when(isset($filters['branch']), fn (Builder $query): Builder => $query->where('branch_id', $filters['branch']))
            ->when(isset($filters['type']), fn (Builder $query): Builder => $query->where('type', $filters['type']))
            ->when(isset($filters['status']), fn (Builder $query): Builder => $query->where('status', $filters['status']))
            ->when(isset($filters['from']), fn (Builder $query): Builder => $query->whereDate('period_end', '>=', $filters['from']))
            ->when(isset($filters['to']), fn (Builder $query): Builder => $query->whereDate('period_start', '<=', $filters['to']));
        $statements = $query->with(['submittedBy', 'reviewedBy'])->withCount(['lines', 'lines as confirmed_count' => fn (Builder $query): Builder => $query->where('status', 'confirmed')])
            ->latest('submitted_at')->paginate(25)->withQueryString()->through(fn (FinancialAuditStatement $statement): array => [
                'id' => $statement->id, 'number' => $statement->number, 'type' => $statement->type, 'branchName' => $statement->snapshot['branchName'],
                'first' => $statement->period_start->toDateString(), 'last' => $statement->period_end->toDateString(), 'status' => $statement->status,
                'total' => $statement->snapshot['report']['actualCollectionTotal'], 'lines' => $statement->lines_count, 'confirmed' => $statement->confirmed_count,
                'submittedBy' => $statement->submittedBy?->name, 'submittedAt' => $statement->submitted_at->toIso8601String(),
            ]);

        return Inertia::render('FinancialAudit/Index', ['statements' => $statements, 'branches' => $branches, 'filters' => $filters, 'branchView' => $branchView]);
    }

    public function store(Request $request, FinancialAuditService $service): RedirectResponse
    {
        $validated = $request->validate(['branch_id' => ['required', 'integer', Rule::exists('branches', 'id')],
            'type' => ['required', Rule::in(['daily', 'weekly', 'monthly'])], 'date' => ['required', 'date_format:Y-m-d']]);
        $statement = $service->submit($request->user(), Branch::findOrFail($validated['branch_id']), $validated['type'], $validated['date']);

        return redirect()->route('financial-audit.show', $statement);
    }

    public function show(Request $request, FinancialAuditStatement $statement): Response
    {
        abort_unless($request->user()->can('view', $statement), 404);
        $actor = $request->user();
        $statement->load(['submittedBy', 'reviewedBy']);
        $validated = $request->validate(['line_status' => ['nullable', Rule::in(['pending', 'confirmed', 'returned', 'responded'])]]);
        $counts = $statement->lines()->select('status')->selectRaw('COUNT(*) as total')->groupBy('status')->pluck('total', 'status');
        $lines = $statement->lines()->with(['reviewedBy', 'correction'])
            ->when(isset($validated['line_status']), fn (Builder $query): Builder => $query->where('status', $validated['line_status']))
            ->orderBy('id')->paginate(100)->withQueryString()->through(fn (FinancialAuditLine $line): array => [
                'id' => $line->id, 'details' => $line->details, 'status' => $line->status, 'notes' => $line->review_notes,
                'response' => $line->response, 'correctionId' => $line->correction_transaction_id,
                'linkedCorrection' => $line->correction ? [
                    'ledgerEffect' => $line->correction->amount,
                    'collectionEffect' => $line->correction->adjustment_type !== null ? '0.00' : ($line->correction->cash_effect_amount ?? '0.00'),
                    'recordedAt' => $line->correction->created_at->toIso8601String(),
                ] : null,
                'reviewedBy' => $line->reviewedBy?->name, 'reviewedAt' => $line->reviewed_at?->toIso8601String(),
            ]);

        return Inertia::render('FinancialAudit/Show', [
            'statement' => ['id' => $statement->id, 'number' => $statement->number, 'type' => $statement->type,
                'branchName' => $statement->snapshot['branchName'], 'first' => $statement->period_start->toDateString(), 'last' => $statement->period_end->toDateString(),
                'status' => $statement->status, 'snapshot' => $statement->snapshot,
                'submittedBy' => $statement->submittedBy?->name, 'submittedAt' => $statement->submitted_at->toIso8601String(),
                'reviewedBy' => $statement->reviewedBy?->name, 'reviewedAt' => $statement->reviewed_at?->toIso8601String()],
            'lines' => $lines, 'counts' => $counts, 'lineStatus' => $validated['line_status'] ?? '',
            'events' => $statement->events()->with('user')->latest('id')->limit(100)->get()->map(fn (FinancialAuditEvent $event): array => [
                'id' => $event->id, 'lineId' => $event->financial_audit_line_id, 'action' => $event->action, 'notes' => $event->notes,
                'by' => $event->user?->name, 'at' => $event->created_at->toIso8601String(), 'correctionId' => $event->correction_transaction_id]),
            'canReview' => $actor->can('review', $statement), 'canRespond' => $actor->can('respond', $statement),
            'reviewRestriction' => $statement->status !== 'audited' && ! $actor->can('review', $statement)
                ? ($statement->submitted_by === $actor->id ? 'أرسلت هذا الكشف بنفسك؛ يراجعه ويعتمده مدقق آخر مخوّل.' : 'الكشف متاح لك للاطلاع أو الرد على الاستفسارات بحسب صلاحياتك.') : null,
            'centralView' => $actor->can('viewAny', FinancialAuditStatement::class),
        ]);
    }

    public function review(Request $request, FinancialAuditStatement $statement, FinancialAuditLine $line, FinancialAuditService $service): RedirectResponse
    {
        Gate::authorize('review', $statement);
        $validated = $request->validate(['action' => ['required', Rule::in(['confirm', 'return'])],
            'notes' => ['required_if:action,return', 'nullable', 'string', 'max:2000']]);
        $service->review($request->user(), $statement, $line, $validated['action'], $validated['notes'] ?? null);

        return back();
    }

    public function respond(Request $request, FinancialAuditStatement $statement, FinancialAuditLine $line, FinancialAuditService $service): RedirectResponse
    {
        abort_unless($request->user()->can('respond', $statement), 404);
        $validated = $request->validate(['response' => ['required', 'string', 'max:2000'], 'correction_transaction_id' => ['nullable', 'integer', 'min:1']]);
        $service->respond($request->user(), $statement, $line, $validated['response'], $validated['correction_transaction_id'] ?? null);

        return back();
    }

    public function approve(Request $request, FinancialAuditStatement $statement, FinancialAuditService $service): RedirectResponse
    {
        Gate::authorize('review', $statement);
        $validated = $request->validate(['notes' => ['nullable', 'string', 'max:2000']]);
        $service->approve($request->user(), $statement, $validated['notes'] ?? null);

        return back();
    }

    public function approveBranch(Request $request, Closing $closing): RedirectResponse
    {
        Gate::authorize('approveBranch', $closing);
        DB::transaction(function () use ($closing, $request): void {
            app(WeeklyClosingService::class)->lock();
            $closing->refresh();
            Gate::authorize('approveBranch', $closing);
            $closing->approve($request->user());
        }, 3);

        return back()->with('status', 'closing-approved');
    }

    public function returnToPreparer(Request $request, Closing $closing): RedirectResponse
    {
        Gate::authorize('approveBranch', $closing);
        $validated = $request->validate(['reason' => ['required', 'string', 'max:1000']]);
        DB::transaction(function () use ($closing, $request, $validated): void {
            app(WeeklyClosingService::class)->lock();
            $closing->refresh();
            Gate::authorize('approveBranch', $closing);
            $closing->returnForCorrection($request->user(), $validated['reason']);
        }, 3);

        return back()->with('status', 'closing-returned');
    }
}
