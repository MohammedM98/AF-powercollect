<?php

namespace App\Http\Controllers;

use App\Enums\ReadingEntryMode;
use App\Http\Requests\UpdateReadingScheduleRequest;
use App\Models\ReadingEntrySetting;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class ReadingScheduleController extends Controller
{
    /**
     * Show the company-wide weekly reading entry schedule.
     */
    public function edit(): InertiaResponse
    {
        $this->authorize('manage', ReadingEntrySetting::class);

        $setting = ReadingEntrySetting::current()->load('updatedBy');

        return Inertia::render('Settings/ReadingSchedule', [
            'setting' => [
                'open_days' => array_map('intval', $setting->open_days),
                'mode' => $setting->mode->value,
                'isOpenNow' => $setting->isOpen(),
                'updatedByName' => $setting->updatedBy?->name,
                'updatedAt' => $setting->updated_at?->timezone(config('app.business_timezone'))->format('Y-m-d H:i'),
            ],
            'modes' => ReadingEntryMode::options(),
        ]);
    }

    /**
     * Update the schedule.
     */
    public function update(UpdateReadingScheduleRequest $request): RedirectResponse
    {
        ReadingEntrySetting::current()->update([
            'open_days' => array_map('intval', $request->validated('open_days')),
            'mode' => $request->validated('mode'),
            'updated_by' => $request->user()->id,
        ]);

        return redirect()->route('settings.reading-schedule.edit')->with('status', 'reading-schedule-updated');
    }
}
