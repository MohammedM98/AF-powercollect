<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateClosingScheduleRequest;
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
 * The closing schedule, set by hand by the Super Admin: when the business
 * day closes, which day starts the week, and whether each day's closings
 * open by themselves or only when opened here.
 */
class ClosingScheduleController extends Controller
{
    public function edit(): InertiaResponse
    {
        $this->authorize('manage', ClosingSetting::class);
        $setting = ClosingSetting::current()->load('updatedBy');

        return Inertia::render('Settings/ClosingSchedule', [
            'setting' => [
                'cutoff_time' => $setting->cutoff(),
                'week_starts_on' => $setting->week_starts_on,
                'auto_open' => $setting->auto_open,
                'updatedByName' => $setting->updatedBy?->name,
                'updatedAt' => $setting->updated_at?->timezone(config('app.business_timezone'))->format('d/m/Y H:i'),
            ],
            'today' => ClosingPeriods::today()->toDateString(),
            'latestDay' => ClosingPeriods::latestEndedDay()->toDateString(),
            'businessTimezone' => config('app.business_timezone'),
        ]);
    }

    public function update(UpdateClosingScheduleRequest $request): RedirectResponse
    {
        ClosingSetting::current()->update([...$request->validated(), 'updated_by' => $request->user()->id]);
        $request->user()->notify(new ActionCompleted('closing-schedule-updated'));

        return back()->with('status', 'closing-schedule-updated');
    }

    /**
     * Open a closed day's closings for every active branch now, whether or
     * not they open by themselves.
     */
    public function open(Request $request): RedirectResponse
    {
        $this->authorize('manage', ClosingSetting::class);
        $validated = $request->validate(['date' => ['required', 'date_format:Y-m-d']]);

        if (! ClosingPeriods::hasEnded($validated['date'])) {
            throw ValidationException::withMessages(['date' => 'هذا اليوم لم يُغلق بعد؛ تُفتح كشوفه بعد وقت القطع.']);
        }

        $count = Closing::openForActiveBranches($validated['date']);
        $request->user()->notify(new ActionCompleted('closings-opened', "{$validated['date']} · {$count} فروع"));

        return back()->with('status', 'closings-opened');
    }
}
