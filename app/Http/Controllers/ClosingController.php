<?php

namespace App\Http\Controllers;

use App\Enums\ClosingDifferenceReason;
use App\Enums\ClosingMatchStatus;
use App\Enums\ClosingStatus;
use App\Http\Concerns\PresentsClosings;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\ClosingPayment;
use App\Models\ClosingSetting;
use App\Notifications\ActionCompleted;
use App\Support\ClosingPeriods;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The closing page: a branch's daily closing (count the cash, match the
 * transfers, send for review, then return or approve), the cash it hands
 * over to the company, and the company's week and month.
 */
class ClosingController extends Controller
{
    use PresentsClosings;

    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', Closing::class);
        $actor = $request->user();
        $validated = $request->validate([
            'tab' => ['nullable', Rule::in(['daily', 'handover', 'period', 'register'])],
            'branch' => ['nullable', 'integer'],
            'date' => ['nullable', 'date_format:Y-m-d'],
            'period' => ['nullable', Rule::in(['weekly', 'monthly'])],
        ]);
        $branches = $this->visibleBranches($actor);
        $branch = $branches->firstWhere('id', (int) ($validated['branch'] ?? 0))
            ?? $branches->firstWhere('id', $actor->branch_id)
            ?? $branches->first();
        $latest = ClosingPeriods::latestEndedDay();
        $date = isset($validated['date']) ? ClosingPeriods::date($validated['date']) : $latest;
        $tab = $validated['tab'] ?? 'daily';
        $period = $validated['period'] ?? 'weekly';

        if (in_array($tab, ['daily', 'handover'], true) && $date->greaterThan($latest)) {
            $date = $latest;
        }

        $closing = $branch && in_array($tab, ['daily', 'handover'], true) ? Closing::dailyFor($branch, $date) : null;

        return Inertia::render('Closings/Index', [
            'tab' => $tab,
            'branches' => $branches->map(fn (Branch $branch): array => ['value' => $branch->id, 'label' => $branch->name])->values(),
            'branchId' => $branch?->id,
            'date' => $date->toDateString(),
            'latestDay' => $latest->toDateString(),
            'period' => $period,
            'daily' => $tab === 'daily' && $closing ? $this->dailyClosingData($closing, $actor) : null,
            'handover' => $tab === 'handover' && $closing ? $this->handoverData($closing, $actor) : null,
            'periodView' => $tab === 'period' && $branch ? [
                ...$this->periodData($period, $date, $branches, $actor),
                'levels' => $this->closingLevels($branch, $date->greaterThan($latest) ? $latest : $date),
            ] : null,
            'register' => $tab === 'register' ? $this->requestedRegister($request, $branches) : null,
            'differenceReasons' => $this->differenceReasons(),
            'cashNotes' => config('powercollect.closing.notes'),
            'cashCoins' => config('powercollect.closing.coins'),
            'userId' => $actor->id,
            'cutoff' => ClosingSetting::current()->cutoff(),
        ]);
    }

    /**
     * The closings register as a CSV file for a spreadsheet, with the same
     * filters as on the page.
     */
    public function export(Request $request): StreamedResponse
    {
        $this->authorize('viewAny', Closing::class);
        $register = $this->requestedRegister($request, $this->visibleBranches($request->user()));
        $columns = ['التاريخ', 'الفرع', 'رقم الكشف', 'الحالة', 'الدفعات', 'التحصيل المؤكد', 'النقد المتوقع', 'النقد المعدود', 'الفرق', 'المعلّق', 'المسلَّم للشركة', 'المستلَم', 'أعدّه', 'اعتمده', 'وقت الاعتماد'];

        return response()->streamDownload(function () use ($register, $columns): void {
            $file = fopen('php://output', 'w');
            fwrite($file, "\u{FEFF}");
            fputcsv($file, $columns);

            foreach ($register['rows'] as $row) {
                fputcsv($file, [
                    $row['day'], $row['branchName'], $row['number'], $row['statusLabel'], $row['payments'], $row['total'], $row['expected'],
                    $row['counted'], $row['difference'], $row['pending'], $row['handedOver'], $row['received'], $row['preparedBy'], $row['reviewedBy'], $row['reviewedAt'],
                ]);
            }

            fputcsv($file, ['المجموع', '', $register['totals']['closings'], '', '', $register['totals']['total'], '', $register['totals']['counted'], $register['totals']['difference'], $register['totals']['pending'], $register['totals']['handedOver'], $register['totals']['received']]);
            fclose($file);
        }, "closings-{$register['from']}-{$register['to']}.csv", ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * The register for the request's filters: one branch or all the
     * user's branches, from and to (this month so far by default, at most
     * a quarter), and a status.
     *
     * @param  Collection<int, Branch>  $branches
     * @return array<string, mixed>
     */
    private function requestedRegister(Request $request, Collection $branches): array
    {
        $latest = ClosingPeriods::latestEndedDay();
        $validated = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
            'status' => ['nullable', Rule::enum(ClosingStatus::class)],
            'filter_branch' => ['nullable', 'integer'],
        ]);
        $to = isset($validated['to']) ? ClosingPeriods::date($validated['to']) : $latest;
        $from = isset($validated['from']) ? ClosingPeriods::date($validated['from']) : $to->startOfMonth();

        if ($from->greaterThan($to) || $from->diffInDays($to) > 92) {
            throw ValidationException::withMessages(['from' => 'اختر فترة صحيحة لا تزيد على ثلاثة أشهر.']);
        }

        $chosen = isset($validated['filter_branch']) ? $branches->where('id', (int) $validated['filter_branch'])->values() : $branches;

        return [
            ...$this->registerData($chosen->isEmpty() ? $branches : $chosen, $from, $to, isset($validated['status']) ? ClosingStatus::from($validated['status']) : null),
            'branchId' => $chosen->count() === 1 && isset($validated['filter_branch']) ? $chosen->first()->id : null,
        ];
    }

    /**
     * Save the cash count and, when it differs from the expected cash, why.
     */
    public function count(Request $request, Closing $closing): RedirectResponse
    {
        $this->authorize('prepare', $closing);
        $values = array_map('strval', [...config('powercollect.closing.notes'), ...config('powercollect.closing.coins')]);
        $validated = $request->validate([
            'denominations' => ['required', 'array'],
            'denominations.*' => ['integer', 'min:0', 'max:100000'],
            'difference_reason' => ['nullable', Rule::enum(ClosingDifferenceReason::class)],
            'difference_notes' => ['nullable', 'string', 'max:1000'],
        ]);
        $denominations = collect($validated['denominations'])
            ->only($values)
            ->map(fn ($count): int => (int) $count)
            ->filter()
            ->all();

        $closing->recordCount(
            $request->user(),
            $denominations,
            isset($validated['difference_reason']) ? ClosingDifferenceReason::from($validated['difference_reason']) : null,
            $validated['difference_notes'] ?? null,
        );

        return back()->with('status', 'closing-counted');
    }

    /**
     * Mark a transfer as found in the receiving account, as not found, or
     * back to waiting.
     */
    public function match(Request $request, Closing $closing, ClosingPayment $line): RedirectResponse
    {
        $this->authorize('prepare', $closing);
        $validated = $request->validate(['status' => ['required', Rule::enum(ClosingMatchStatus::class)]]);
        abort_unless($line->closing_id === $closing->id, 404);

        $closing->matchLine($request->user(), $line, ClosingMatchStatus::from($validated['status']));

        return back();
    }

    public function submit(Request $request, Closing $closing): RedirectResponse
    {
        $this->authorize('prepare', $closing);
        $closing->submit($request->user());

        $request->user()->notify(new ActionCompleted('closing-submitted', "الكشف {$closing->number}"));

        return back()->with('status', 'closing-submitted');
    }

    public function returnForCorrection(Request $request, Closing $closing): RedirectResponse
    {
        $this->authorize('audit', $closing);
        $validated = $request->validate(['reason' => ['required', 'string', 'max:1000']], ['reason.required' => 'اكتب سبب إرجاع الكشف وما يجب تصحيحه.']);
        $closing->returnForCorrection($request->user(), $validated['reason']);

        $request->user()->notify(new ActionCompleted('closing-returned', "الكشف {$closing->number}"));

        return back()->with('status', 'closing-returned');
    }

    public function approve(Request $request, Closing $closing): RedirectResponse
    {
        $this->authorize('audit', $closing);
        $closing->approve($request->user());

        $request->user()->notify(new ActionCompleted('closing-approved', "الكشف {$closing->number}"));

        return back()->with('status', 'closing-approved');
    }
}
