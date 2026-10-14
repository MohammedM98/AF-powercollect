<?php

namespace App\Http\Controllers;

use App\Enums\CashBoxType;
use App\Enums\ClosingStatus;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\ClosingConfirmation;
use App\Models\ClosingEvent;
use App\Models\ClosingSetting;
use App\Models\Subscription;
use App\Models\User;
use App\Support\BranchBoxes;
use App\Support\BranchClosingAccess;
use App\Support\BranchClosingWorkflow;
use App\Support\WeeklyClosingSummary;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class WeeklyClosingController extends Controller
{
    public function __construct(private BranchClosingWorkflow $workflow, private BranchBoxes $branchBoxes, private WeeklyClosingSummary $summary) {}

    /**
     * The branch's weekly closings by year and month, each with its boxes'
     * sums and the step it reached, and the one picked with `?closing_id=`
     * in full: its boxes by type and by collector, the collectors'
     * confirmations and what the actor may do next. Those who close the
     * branch's boxes see every collector (or one, with `?user_id=`); a
     * collector sees only the weeks holding boxes of theirs, and only those.
     */
    public function index(Request $request): Response
    {
        $actor = $request->user();
        $managesBranch = BranchClosingAccess::view($actor);
        abort_unless($managesBranch || ($actor->is_active && $actor->branch_id && $actor->can('viewOwnCashBoxes', Subscription::class)), 403);
        if ($managesBranch) {
            [$branches, $branch] = $this->branchBoxes->branch($request, $actor);
        } else {
            $branches = Branch::query()->whereKey($actor->branch_id)->get(['id', 'name']);
            $branch = $branches->firstOrFail();
        }
        $started = ClosingSetting::ownFor($branch->id)?->workflow_started_at !== null;
        if ($started) {
            $this->workflow->refresh($branch->id);
        }

        $weeks = Closing::query()->where('branch_id', $branch->id)->whereNotNull('workflow_settings');
        $years = (clone $weeks)->pluck('period_start')->map(fn ($date): int => $date->year)->push((int) now()->year)->unique()->sortDesc()->values();
        $year = $years->contains($request->integer('year')) ? $request->integer('year') : $years->first();
        $month = in_array($request->integer('month'), range(1, 12), true) ? $request->integer('month') : null;
        $step = in_array($request->query('step'), [...WeeklyClosingSummary::STEPS, 'done'], true) ? $request->query('step') : '';
        $type = in_array($request->query('type'), array_column(CashBoxType::cases(), 'value'), true) ? $request->query('type') : '';
        $collectorId = $managesBranch ? ($request->integer('user_id') ?: null) : $actor->id;
        $narrow = fn (array $boxes): array => array_values(array_filter($boxes, fn (array $box): bool => (! $collectorId || $box['userId'] === $collectorId) && (! $type || $box['type'] === $type)));

        $rows = (clone $weeks)->whereYear('period_start', $year)->when($month, fn (Builder $query) => $query->whereMonth('period_start', $month))
            ->with('confirmations')->orderByDesc('coverage_from')->orderBy('id')->get()
            ->map(function (Closing $closing) use ($narrow, $collectorId): ?array {
                $boxes = $this->summary->boxes($closing);
                if ($collectorId && ! collect($boxes)->contains('userId', $collectorId)) {
                    return null;
                }
                $totals = $this->summary->totals($narrow($boxes));
                unset($totals['byCollector']);

                return [...$this->week($closing), 'totals' => $totals];
            })
            ->filter()->when($step, fn ($rows) => $rows->where('step', $step))->values();

        $selected = $request->integer('closing_id') ? (clone $weeks)->with('confirmations.user:id,name')->findOrFail($request->integer('closing_id')) : null;

        return Inertia::render('WeeklyClosings/Index', [
            'branch' => $branch,
            'branches' => $branches,
            'started' => $started,
            'mode' => $managesBranch ? 'branch' : 'collector',
            'weeks' => $rows,
            'selected' => $selected ? $this->details($selected, $actor, $managesBranch, $narrow) : null,
            'filters' => ['year' => $year, 'month' => $month, 'step' => $step, 'type' => $type, 'user_id' => $managesBranch ? $collectorId : null],
            'years' => $years,
            'people' => $managesBranch ? $this->branchBoxes->people($branch->id) : [],
            'urls' => ['index' => route('weekly-packages.index'), 'actions' => url('/reconciliation/actions'), 'reconciliation' => route('closings.index')],
        ]);
    }

    /** @return array<string, mixed> */
    private function week(Closing $closing): array
    {
        return [
            ...$closing->only(['id', 'number', 'coverage_from', 'coverage_until', 'is_manual', 'workflow_settings']),
            'year' => $closing->period_start->year,
            'month' => $closing->period_start->month,
            'status' => $closing->status->value,
            'step' => $this->summary->step($closing),
            'confirmations' => ['confirmed' => $closing->confirmations->whereNotNull('confirmed_at')->count(), 'total' => $closing->confirmations->count()],
        ];
    }

    /**
     * The week in full, narrowed to the collector and type asked for, and
     * what the actor may do with it now.
     *
     * @param  callable(list<array<string, mixed>>): list<array<string, mixed>>  $narrow
     * @return array<string, mixed>
     */
    private function details(Closing $closing, User $actor, bool $managesBranch, callable $narrow): array
    {
        $boxes = $this->summary->boxes($closing);
        $own = $closing->confirmations->firstWhere('user_id', $actor->id);
        abort_unless($managesBranch || $own || collect($boxes)->contains('userId', $actor->id), 404);
        $shown = $narrow($boxes);
        $step = $this->summary->step($closing);
        $approve = $managesBranch && BranchClosingAccess::approve($actor, $closing->branch_id);
        $audited = $closing->reviewed_at || $closing->reviewed_by || $closing->auditNotes()->exists();

        return [
            ...$this->week($closing),
            'branchApprovedAt' => $closing->branch_approved_at,
            'branchApprovedBy' => $closing->branchApprovedBy?->name,
            'branchNotes' => $closing->branch_notes,
            'submittedAt' => $closing->submitted_at,
            'frozen' => $closing->submitted_snapshot !== null,
            'boxes' => $shown,
            'totals' => $this->summary->totals($shown),
            'confirmationList' => $closing->confirmations->filter(fn (ClosingConfirmation $confirmation): bool => $managesBranch || $confirmation->user_id === $actor->id)
                ->map(fn (ClosingConfirmation $confirmation): array => ['userId' => $confirmation->user_id, 'name' => $confirmation->user?->name, 'confirmedAt' => $confirmation->confirmed_at])->values(),
            'lockBlockers' => $step === 'lock' ? $this->workflow->blockers($closing) : [],
            'sendBlockers' => $managesBranch && $closing->status === ClosingStatus::Locked ? $this->workflow->sendBlockers($closing) : [],
            'warnings' => $managesBranch ? ($closing->submitted_snapshot['warnings'] ?? ($step === 'lock' ? $this->workflow->warnings($closing) : [])) : [],
            'events' => $managesBranch ? $closing->events()->with('user:id,name')->latest('id')->limit(15)->get()->map(fn (ClosingEvent $event): array => ['id' => $event->id, 'description' => $event->description, 'user' => $event->user?->name, 'at' => $event->created_at]) : [],
            'can' => [
                'lock' => $approve && $step === 'lock',
                'submit' => $approve && $step === 'submit',
                'withdraw' => $approve && in_array($closing->status, [ClosingStatus::Locked, ClosingStatus::Submitted], true) && ! $audited,
                'acknowledge' => $closing->status === ClosingStatus::Locked && $own !== null && $own->confirmed_at === null,
            ],
            'packageUrl' => $managesBranch ? route('closings.index', ['branch_id' => $closing->branch_id, 'closing_id' => $closing->id, 'tab' => 'history']) : null,
        ];
    }
}
