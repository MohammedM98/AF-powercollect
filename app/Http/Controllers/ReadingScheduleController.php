<?php

namespace App\Http\Controllers;

use App\Enums\ReadingEntryMode;
use App\Http\Requests\UpdateReadingScheduleRequest;
use App\Models\ReadingEntrySetting;
use App\Notifications\ActionCompleted;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Carbon;
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
        $businessNow = now()->timezone(config('app.business_timezone'));
        $businessDate = Carbon::parse($businessNow->toDateString());
        $currentWeeks = [];

        foreach (range(0, 6) as $readingDay) {
            $preview = $setting->replicate();
            $preview->changeReadingDay($readingDay);
            $currentWeeks[$readingDay] = [
                'start' => $preview->weekStartFor($businessDate)->toDateString(),
                'end' => $preview->weekEndFor($businessDate)->toDateString(),
            ];
        }

        return Inertia::render('Settings/ReadingSchedule', [
            'setting' => [
                'reading_day' => $setting->reading_day,
                'open_days' => array_map('intval', $setting->open_days),
                'opens_at' => substr($setting->opens_at, 0, 5),
                'closes_at' => substr($setting->closes_at, 0, 5),
                'mode' => $setting->mode->value,
                'reading_day_history' => $setting->reading_day_history ?? [],
                'isOpenNow' => $setting->isOpen(),
                'latestWeekEnd' => $setting->weekEndFor($setting->latestEndedWeekStart())->toDateString(),
                'updatedByName' => $setting->updatedBy?->name,
                'updatedAt' => $setting->updated_at?->timezone(config('app.business_timezone'))->format('Y-m-d H:i'),
            ],
            'modes' => ReadingEntryMode::options(),
            // What choosing each reading day would do to the next week.
            'firstWeeks' => $setting->firstWeekOnEachReadingDay(),
            'currentWeeks' => $currentWeeks,
            'businessNow' => $businessNow->toIso8601String(),
            'businessTimezone' => config('app.business_timezone'),
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
        ] + $request->safe()->only(['opens_at', 'closes_at']));

        $request->user()->notify(new ActionCompleted('reading-schedule-updated'));

        return redirect()->route('settings.reading-schedule.edit')->with('status', 'reading-schedule-updated');
    }
}
