<?php

namespace App\Http\Controllers;

use App\Enums\ClosingStatus;
use App\Enums\ClosingType;
use App\Http\Concerns\PresentsClosings;
use App\Models\Branch;
use App\Models\Closing;
use App\Notifications\ActionCompleted;
use App\Support\ClosingPeriods;
use App\Support\WeeklyClosingService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Approving the company's week or month, once it is over and every
 * branch's day in it with payments has an approved daily closing. The
 * approval is saved under the period's number; it adds up no closings and
 * records no payments.
 */
class PeriodClosingController extends Controller
{
    use PresentsClosings;

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'period' => ['required', Rule::in(['weekly', 'monthly'])],
            'date' => ['required', 'date_format:Y-m-d'],
            'early' => ['sometimes', 'boolean', 'prohibited_if:period,monthly'],
        ]);
        $early = (bool) ($validated['early'] ?? false);
        $this->authorize($validated['period'] === 'weekly' ? ($early ? 'closeWeekEarly' : 'closeWeek') : 'approvePeriod', Closing::class);
        $actor = $request->user();
        $date = ClosingPeriods::date($validated['date']);
        if ($validated['period'] === 'weekly') {
            $closing = app(WeeklyClosingService::class)->close($validated['date'], $actor,
                fn (): array => $this->periodData('weekly', $date, Branch::query()->orderBy('name')->get(), $actor, $early),
                $early);
            $actor->notify(new ActionCompleted('period-approved', $closing->number));

            return back()->with('status', 'period-approved');
        }
        $summary = $this->periodData($validated['period'], $date, Branch::query()->orderBy('name')->get(), $actor);

        if (! $summary['canApprove']) {
            throw ValidationException::withMessages(['period' => $summary['blockers'][0] ?? 'اعتُمدت هذه الفترة من قبل.']);
        }

        try {
            $closing = Closing::create([
                'number' => $summary['number'],
                'type' => $validated['period'] === 'monthly' ? ClosingType::Monthly : ClosingType::Weekly,
                'period_start' => $summary['first'],
                'period_end' => $summary['last'],
                'status' => ClosingStatus::Approved,
                'prepared_by' => $actor->id,
                'submitted_at' => now(),
                'reviewed_by' => $actor->id,
                'reviewed_at' => now(),
            ]);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['period' => 'اعتُمدت هذه الفترة من قبل.']);
        }

        $closing->record($actor, 'approved', sprintf('اعتُمد %s للتحصيل %s ₪', __($closing->type->label()), $summary['collected']));

        $actor->notify(new ActionCompleted('period-approved', $closing->number));

        return back()->with('status', 'period-approved');
    }
}
