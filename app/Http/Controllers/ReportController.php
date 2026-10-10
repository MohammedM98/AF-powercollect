<?php

namespace App\Http\Controllers;

use App\Http\Concerns\PresentsClosings;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\SubscriptionTransaction;
use App\Support\BranchReport;
use App\Support\ClosingPeriods;
use App\Support\DailySeries;
use App\Support\ReportPeriod;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The reports page (التقارير): a branch's day — or any stretch of days, or
 * every branch the user may see — before it is closed: how what the
 * subscriptions owe moved, where the payments came in, the readings, each
 * day's closing, and every line, which download as a CSV. Read-only, for
 * whoever may open the closings, over the same branches.
 */
class ReportController extends Controller
{
    use PresentsClosings;

    /**
     * The longest stretch a report covers, as on the closings register.
     */
    private const MAX_DAYS = 92;

    private const PER_PAGE = 50;

    public function index(Request $request): InertiaResponse
    {
        $this->authorize('viewAny', Closing::class);
        $branches = $this->visibleBranches($request->user());
        ['chosen' => $chosen, 'branch' => $branch, 'from' => $from, 'to' => $to, 'today' => $today, 'kind' => $kind] = $this->filters($request, $branches);
        $report = new BranchReport($chosen, $from, $to);
        $oneBranchDay = $chosen->count() === 1 && $from->equalTo($to);
        $period = ReportPeriod::describe($from, $to, $request->query('view'), $today);
        $branchSummary = $chosen->count() > 1
            ? $chosen->map(function (Branch $item) use ($from, $to): array {
                $branchReport = new BranchReport(collect([$item]), $from, $to);

                return [
                    'id' => $item->id,
                    'name' => $item->name,
                    'flow' => $branchReport->flow(),
                    'collections' => $branchReport->collections(),
                ];
            })->values()
            : collect();

        return Inertia::render('Reports/Index', [
            'branches' => $branches->map(fn (Branch $branch): array => ['value' => $branch->id, 'label' => $branch->name])->values(),
            'filters' => ['branch' => $branch, 'from' => $from->toDateString(), 'to' => $to->toDateString(), 'kind' => $kind],
            'scopeLabel' => $chosen->count() === 1 ? $chosen->first()->name : 'كل الفروع',
            'canExport' => $request->user()->can('export', Closing::class),
            'period' => $period,
            'branchSummary' => $branchSummary,
            'presets' => $this->presets($today),
            'today' => $today->toDateString(),
            'cutoff' => ClosingPeriods::for($chosen->count() === 1 ? $chosen->first() : null)->cutoff(),
            'kinds' => BranchReport::kinds(),
            'flow' => $chosen->isEmpty() ? null : $report->flow(),
            'collections' => $chosen->isEmpty() ? null : $report->collections(),
            'readings' => $chosen->isEmpty() ? null : $report->readings(),
            'days' => $chosen->isEmpty() ? [] : $report->days(),
            'check' => $oneBranchDay ? $report->dayCheck() : null,
            'transactions' => $report->lines($kind)
                ->with(['subscription.branch', 'subscription.meterBox', 'recordedBy', 'meterReading', 'reverses.meterReading'])
                ->orderByDesc('subscription_transactions.created_at')
                ->orderByDesc('subscription_transactions.id')
                ->paginate(self::PER_PAGE)
                ->withQueryString()
                ->through(fn (SubscriptionTransaction $line): array => $this->row($line)),
        ]);
    }

    /**
     * The report's lines, oldest first, as a CSV file for a spreadsheet,
     * with the same filters as on the page.
     */
    public function export(Request $request): StreamedResponse
    {
        $this->authorize('export', Closing::class);
        ['chosen' => $chosen, 'from' => $from, 'to' => $to, 'kind' => $kind] = $this->filters($request, $this->visibleBranches($request->user()));
        $lines = (new BranchReport($chosen, $from, $to))->lines($kind)
            ->with(['subscription.branch', 'subscription.meterBox', 'recordedBy', 'meterReading', 'reverses.meterReading'])
            ->orderBy('subscription_transactions.created_at')
            ->orderBy('subscription_transactions.id');
        $columns = ['التاريخ', 'الوقت', 'الفرع', 'رقم السند', 'المشترك', 'رقم الحساب', 'الطبلون', 'النوع', 'البيان', 'طريقة الدفع', 'الحساب', 'العملة', 'المبلغ بالعملة', 'عليه', 'له', 'سجّله', 'ملغى'];

        return response()->streamDownload(function () use ($lines, $columns): void {
            $file = fopen('php://output', 'w');
            fwrite($file, "\u{FEFF}");
            fputcsv($file, $columns);

            foreach ($lines->lazy(500) as $line) {
                $row = $this->row($line);
                fputcsv($file, [
                    $row['day'], $row['time'], $row['branchName'], $row['voucherNumber'], $row['subscriptionName'], $row['accountNumber'], $row['meterBoxNumber'],
                    $row['typeLabel'], $row['description'], $row['methodLabel'], $row['account'], $row['currency'], $row['currencyAmount'],
                    $row['isCredit'] ? '' : $row['amount'], $row['isCredit'] ? $row['amount'] : '', $row['recordedBy'], $row['isCancelled'] ? 'نعم' : '',
                ]);
            }

            fclose($file);
        }, "report-{$from->toDateString()}-{$to->toDateString()}.csv", ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * The request's branch (one of the user's, or all of them when they see
     * more than one), its days (today by default, the day furthest along
     * among the branches; never past today, at most a quarter) and the kind
     * of line listed.
     *
     * @param  Collection<int, Branch>  $branches
     * @return array{chosen: Collection<int, Branch>, branch: int|string|null, from: CarbonImmutable, to: CarbonImmutable, today: CarbonImmutable, kind: string}
     */
    private function filters(Request $request, Collection $branches): array
    {
        $validated = $request->validate([
            'branch' => ['nullable', 'string'],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
            'kind' => ['nullable', Rule::in(array_column(BranchReport::kinds(), 'value'))],
        ]);
        $requested = $validated['branch'] ?? null;
        $all = $requested === 'all' && $branches->count() > 1;
        $branch = $all ? null : ($branches->firstWhere('id', (int) $requested)
            ?? $branches->firstWhere('id', $request->user()->branch_id)
            ?? $branches->first());
        $chosen = $all ? $branches : collect([$branch])->filter()->values();
        $today = ClosingPeriods::furthestToday($chosen);
        $to = isset($validated['to']) ? ClosingPeriods::date($validated['to']) : $today;
        $from = isset($validated['from']) ? ClosingPeriods::date($validated['from']) : $to;

        if ($to->greaterThan($today)) {
            $to = $today;
        }

        if ($from->greaterThan($to) || $from->diffInDays($to) >= self::MAX_DAYS) {
            throw ValidationException::withMessages(['from' => 'اختر فترة صحيحة لا تزيد على ثلاثة أشهر ولا تتجاوز اليوم.']);
        }

        return [
            'chosen' => $chosen,
            'branch' => $all ? 'all' : $branch?->id,
            'from' => $from,
            'to' => $to,
            'today' => $today,
            'kind' => $validated['kind'] ?? 'all',
        ];
    }

    /**
     * The quick picks above the report: today, yesterday, this week, this
     * month and last month, by the closing schedule's week and cut-off.
     *
     * @return array<int, array{key: string, label: string, from: string, to: string}>
     */
    private function presets(CarbonImmutable $today): array
    {
        [$weekStart] = ClosingPeriods::week($today);
        [$lastMonthStart, $lastMonthEnd] = ClosingPeriods::month($today->startOfMonth()->subDay());

        return array_map(fn (array $preset): array => [...$preset, 'from' => $preset['from']->toDateString(), 'to' => $preset['to']->toDateString()], [
            ['key' => 'today', 'label' => 'اليوم', 'from' => $today, 'to' => $today],
            ['key' => 'yesterday', 'label' => 'أمس', 'from' => $today->subDay(), 'to' => $today->subDay()],
            ['key' => 'week', 'label' => 'هذا الأسبوع', 'from' => $weekStart, 'to' => $today],
            ['key' => 'month', 'label' => 'هذا الشهر', 'from' => $today->startOfMonth(), 'to' => $today],
            ['key' => 'last-month', 'label' => 'الشهر الماضي', 'from' => $lastMonthStart, 'to' => $lastMonthEnd],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function row(SubscriptionTransaction $line): array
    {
        $isPayment = $line->isPayment();

        return [
            'id' => $line->id,
            'day' => ClosingPeriods::for($line->subscription->branch_id)->dayOf($line->created_at),
            'time' => DailySeries::localTime($line->created_at),
            'branchName' => $line->subscription->branch?->name,
            'voucherNumber' => $line->printedVoucherNumber(),
            'subscriptionName' => $line->subscription->displayName(),
            'accountNumber' => $line->subscription->account_number,
            'meterBoxNumber' => $line->subscription->meterBox?->box_number,
            'type' => $line->type,
            'typeLabel' => $line->typeLabel(),
            'description' => $line->description(),
            'methodLabel' => $isPayment && $line->payment_method ? __($line->payment_method->label()) : null,
            'account' => $isPayment ? ($line->bank_name ?? 'الصندوق النقدي') : null,
            'currency' => $isPayment ? $line->currency?->value : null,
            'currencyAmount' => $isPayment && $line->currency_amount !== null ? SubscriptionTransaction::formatAmount($line->currency_amount) : null,
            'isCredit' => $line->isCredit(),
            'isCancelled' => $line->isCancelled() || $line->isReversal(),
            'amount' => ltrim((string) $line->amount, '-'),
            'recordedBy' => $line->recordedBy?->name,
        ];
    }
}
