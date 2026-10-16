<?php

namespace App\Http\Controllers;

use App\Enums\CashBoxType;
use App\Models\Closing;
use App\Models\ClosingEvent;
use App\Models\ClosingSetting;
use App\Models\ClosingVersion;
use App\Models\User;
use App\Support\BranchBoxes;
use App\Support\BranchClosingAccess;
use App\Support\BranchClosingWorkflow;
use App\Support\WeeklyClosingSummary;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class WeeklyClosingController extends Controller
{
    public function __construct(private BranchClosingWorkflow $workflow, private BranchBoxes $branchBoxes, private WeeklyClosingSummary $summary) {}

    /**
     * The branch's weekly closings by year and month, each with its boxes'
     * sums and the step it reached, and one week in full: the one picked
     * with `?closing_id=`, else the first waiting on the branch to confirm
     * it, else the latest, whose address the page then moves to so that
     * acting on the week comes back to it. In full, a week has its boxes with their entries,
     * its sums by type and by collector, and whether the actor may confirm
     * it and send it to audit. `?step=`, `?type=` and `?user_id=` narrow the
     * weeks and their boxes.
     */
    public function index(Request $request): Response|RedirectResponse
    {
        $actor = $request->user();
        abort_unless(BranchClosingAccess::view($actor), 403);
        [$branches, $branch] = $this->branchBoxes->branch($request, $actor);
        $started = ClosingSetting::ownFor($branch->id)?->workflow_started_at !== null;
        if ($started) {
            $this->workflow->refresh($branch->id);
        }

        $weeks = Closing::query()->where('branch_id', $branch->id)->whereNotNull('workflow_settings')->withCount('auditNotes');
        $years = (clone $weeks)->pluck('period_start')->map(fn ($date): int => $date->year)->push((int) now()->year)->unique()->sortDesc()->values();
        $year = $years->contains($request->integer('year')) ? $request->integer('year') : $years->first();
        $month = in_array($request->integer('month'), range(1, 12), true) ? $request->integer('month') : null;
        $step = in_array($request->query('step'), WeeklyClosingSummary::STEPS, true) ? $request->query('step') : '';
        $type = in_array($request->query('type'), array_column(CashBoxType::cases(), 'value'), true) ? $request->query('type') : '';
        $collectorId = $request->integer('user_id') ?: null;
        $narrow = fn (array $boxes): array => array_values(array_filter($boxes, fn (array $box): bool => (! $collectorId || $box['userId'] === $collectorId) && (! $type || $box['type'] === $type)));

        $rows = (clone $weeks)->whereYear('period_start', $year)->when($month, fn (Builder $query) => $query->whereMonth('period_start', $month))
            ->orderByDesc('coverage_from')->orderBy('id')->get()
            ->map(function (Closing $closing) use ($narrow): array {
                $totals = $this->summary->totals($narrow($this->summary->boxes($closing)));
                unset($totals['byType'], $totals['byCollector']);

                return [...$this->week($closing), 'totals' => $totals];
            })
            ->when($step, fn ($rows) => $rows->where('step', $step))
            ->when($collectorId || $type, fn ($rows) => $rows->where('totals.boxes', '>', 0))->values();

        $selectedId = $request->integer('closing_id') ?: ($rows->firstWhere('step', 'confirm') ?? $rows->first())['id'] ?? null;
        if ($selectedId && ! $request->integer('closing_id')) {
            return redirect()->route('weekly-packages.index', [...$request->query(), 'closing_id' => $selectedId]);
        }
        $selected = $selectedId ? (clone $weeks)->findOrFail($selectedId) : null;

        return Inertia::render('WeeklyClosings/Index', [
            'branch' => $branch,
            'branches' => $branches,
            'started' => $started,
            'weeks' => $rows,
            'selected' => $selected ? $this->details($selected, $actor, $narrow) : null,
            'filters' => ['year' => $year, 'month' => $month, 'step' => $step, 'type' => $type, 'user_id' => $collectorId],
            'years' => $years,
            'people' => $this->branchBoxes->people($branch->id),
            'urls' => ['index' => route('weekly-packages.index'), 'actions' => url('/reconciliation/actions')],
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
        ];
    }

    /**
     * The week in full, narrowed to the collector and type asked for, with
     * the whole week's totals for the confirmation, the versions sent of
     * it, and what the actor may do with it now: close the week early or
     * send it. A week sent is never taken back; any correction is entered
     * in the open week.
     *
     * @param  callable(list<array<string, mixed>>): list<array<string, mixed>>  $narrow
     * @return array<string, mixed>
     */
    private function details(Closing $closing, User $actor, callable $narrow): array
    {
        $boxes = $this->summary->boxes($closing, withEntries: true);
        $shown = $narrow($boxes);
        $step = $this->summary->step($closing);
        $approve = BranchClosingAccess::approve($actor, $closing->branch_id);
        $running = ! $closing->submitted_snapshot && $closing->coverage_from->lessThan(now()) && $closing->coverage_until->greaterThan(now());

        return [
            ...$this->week($closing),
            'branchApprovedAt' => $closing->branch_approved_at,
            'branchApprovedBy' => $closing->branchApprovedBy?->name,
            'branchNotes' => $closing->branch_notes,
            'reviewedAt' => $closing->reviewed_at,
            'frozen' => $closing->submitted_snapshot !== null,
            'boxes' => $shown,
            'totals' => $this->summary->totals($shown),
            'weekTotals' => $this->summary->totals($boxes),
            'blockers' => $step === 'confirm' ? $this->workflow->blockers($closing) : [],
            'warnings' => $closing->submitted_snapshot['warnings'] ?? ($step === 'confirm' ? $this->workflow->warnings($closing) : []),
            'events' => $closing->events()->with('user:id,name')->latest('id')->limit(15)->get()->map(fn (ClosingEvent $event): array => ['id' => $event->id, 'description' => $event->description, 'user' => $event->user?->name, 'at' => $event->created_at]),
            'versions' => $this->versions($closing),
            'can' => [
                'submit' => $approve && $step === 'confirm',
                'closeEarly' => $approve && $running,
            ],
        ];
    }

    /**
     * Each version of the week the branch sent, newest first: who sent it
     * and when, its note, whether it was withdrawn (as weeks once could be), and what it held.
     *
     * @return list<array<string, mixed>>
     */
    private function versions(Closing $closing): array
    {
        $versions = ClosingVersion::query()->where('closing_id', $closing->id)->orderByDesc('version')->get();
        $names = User::query()->whereIn('id', $versions->pluck('user_id')->filter())->pluck('name', 'id');

        return $versions->map(function (ClosingVersion $version) use ($closing, $names): array {
            $summary = $this->workflow->reviewSummary($closing, [...['electronic' => [], 'clearings' => [], 'transfers' => []], ...$version->snapshot]);

            return [
                'id' => $version->id, 'version' => $version->version, 'notes' => $version->notes,
                'by' => $names[$version->user_id] ?? null, 'at' => $version->created_at, 'withdrawnAt' => $version->withdrawn_at,
                'cash' => $summary['cash'], 'bank' => $summary['bank'], 'clearing' => $summary['clearing'],
            ];
        })->all();
    }
}
