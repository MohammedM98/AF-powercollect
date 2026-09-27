<?php

namespace App\Http\Controllers;

use App\Enums\ReadingEntryMode;
use App\Http\Requests\UpdateReadingScheduleRequest;
use App\Models\ReadingEntrySetting;
use App\Notifications\ActionCompleted;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class ReadingScheduleController extends Controller
{
    /**
     * Show the company-wide weekly reading day and entry schedule.
     */
    public function edit(): InertiaResponse
    {
        $this->authorize('manage', ReadingEntrySetting::class);

        $setting = ReadingEntrySetting::current()->load('updatedBy');

        return Inertia::render('Settings/ReadingSchedule', [
            'setting' => [
                'reading_day' => $setting->reading_day,
                'open_days' => array_map('intval', $setting->open_days),
                'mode' => $setting->mode->value,
                'isOpenNow' => $setting->isOpen(),
                'latestWeekEnd' => $setting->weekEndFor($setting->latestEndedWeekStart())->toDateString(),
                'updatedByName' => $setting->updatedBy?->name,
                'updatedAt' => $setting->updated_at?->timezone(config('app.business_timezone'))->format('Y-m-d H:i'),
            ],
            'modes' => ReadingEntryMode::options(),
            // What choosing each reading day would do to the next week.
            'firstWeeks' => $setting->firstWeekOnEachReadingDay(),
        ]);
    }

    /**
     * Update the schedule. A new reading day shapes the weeks after the
     * latest one that has ended; weeks already ended keep their dates.
     */
    public function update(UpdateReadingScheduleRequest $request): RedirectResponse
    {
        $setting = ReadingEntrySetting::current();
        $setting->changeReadingDay($request->integer('reading_day'));

        $setting->update([
            'open_days' => array_map('intval', $request->validated('open_days')),
            'mode' => $request->validated('mode'),
            'updated_by' => $request->user()->id,
        ]);

        $request->user()->notify(new ActionCompleted('reading-schedule-updated'));

        return redirect()->route('settings.reading-schedule.edit')->with('status', 'reading-schedule-updated');
    }
}
