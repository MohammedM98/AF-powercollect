<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateClosingScheduleRequest;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\ClosingSetting;
use App\Notifications\ActionCompleted;
use App\Support\ClosingPeriods;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

/**
 * The closing schedule, set by hand: when a branch's business day closes,
 * whether its daily closings open by themselves or only when opened here, and
 * (for the whole company) which day starts the week. Each branch's admin sets
 * their own branch's; the Super Admin sets any branch's and the company's
 * default, which the branches without a schedule of their own follow.
 */
class ClosingScheduleController extends Controller
{
    public function edit(Request $request): InertiaResponse
    {
        $this->authorize('manageAny', ClosingSetting::class);
        $actor = $request->user();
        $branch = $this->requestedBranch($request->integer('branch') ?: null, $actor->isSuperAdmin() ? null : $actor->branch_id);
        $this->authorize('manage', [ClosingSetting::class, $branch]);
        $setting = ClosingSetting::forBranch($branch)->load('updatedBy');
        $periods = ClosingPeriods::for($branch);

        return Inertia::render('Settings/ClosingSchedule', [
            'setting' => [
                'cutoff_time' => $setting->cutoff(),
                'week_starts_on' => ClosingSetting::company()->week_starts_on,
                'auto_open' => $setting->auto_open,
                'updatedByName' => $setting->updatedBy?->name,
                'updatedAt' => $setting->updated_at?->timezone(config('app.business_timezone'))->format('d/m/Y H:i'),
            ],
            'branch' => $branch ? ['id' => $branch->id, 'name' => $branch->name] : null,
            'branches' => $actor->isSuperAdmin()
                ? Branch::query()->orderBy('name')->get()->map(fn (Branch $item): array => [
                    'value' => $item->id,
                    'label' => $item->name,
                    'hasOwn' => ClosingSetting::ownFor($item) !== null,
                ])->all()
                : [],
            'followsCompany' => $branch !== null && ClosingSetting::ownFor($branch) === null,
            'branchesWithOwn' => ClosingSetting::ownCount(),
            'today' => $periods->today()->toDateString(),
            'latestDay' => $periods->latestEndedDay()->toDateString(),
            'businessTimezone' => config('app.business_timezone'),
        ]);
    }

    /**
     * Save the schedule of the branch, or the company's default when no branch
     * is given. A branch that still followed the company's gets a schedule of
     * its own the first time its admin saves one.
     */
    public function update(UpdateClosingScheduleRequest $request): RedirectResponse
    {
        $branch = $request->branch();
        $setting = $branch === null
            ? ClosingSetting::company()
            : (ClosingSetting::ownFor($branch) ?? new ClosingSetting(['branch_id' => $branch->id]));

        $setting->fill([...$request->safe()->only(['cutoff_time', 'auto_open']), 'updated_by' => $request->user()->id]);

        if ($branch === null) {
            $setting->week_starts_on = $request->integer('week_starts_on');
        }

        $setting->save();
        $request->user()->notify(new ActionCompleted('closing-schedule-updated'));

        return back()->with('status', 'closing-schedule-updated');
    }

    /**
     * Open a closed day's closings now, whether or not they open by
     * themselves: the branch's, or every active branch's where the day has
     * closed. A day closes at each branch's own cut-off.
     */
    public function open(Request $request): RedirectResponse
    {
        $this->authorize('manageAny', ClosingSetting::class);
        $validated = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
        ]);
        $branch = $this->requestedBranch($validated['branch_id'] ?? null, null);
        $this->authorize('manage', [ClosingSetting::class, $branch]);

        $count = $branch === null
            ? Closing::openForActiveBranches($validated['date'])
            : (int) Closing::openFor($branch, $validated['date']);

        if ($count === 0) {
            throw ValidationException::withMessages(['date' => 'هذا اليوم لم يُغلق بعد؛ تُفتح كشوفه بعد وقت القطع.']);
        }

        $request->user()->notify(new ActionCompleted('closings-opened', $branch ? "{$validated['date']} · {$branch->name}" : "{$validated['date']} · {$count} فروع"));

        return back()->with('status', 'closings-opened');
    }

    /**
     * The branch asked for, or else the user's own; none means the company.
     */
    private function requestedBranch(?int $requested, ?int $fallback): ?Branch
    {
        $id = $requested ?? $fallback;

        return $id === null ? null : Branch::query()->findOrFail($id);
    }
}
