<?php

namespace Tests\Feature;

use App\Enums\ChargeType;
use App\Enums\ClosingStatus;
use App\Enums\CorrectionReason;
use App\Enums\DiscountMethod;
use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\MeterReading;
use App\Models\Permission;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class BranchReportTest extends TestCase
{
    use RefreshDatabase;

    private Branch $north;

    private Branch $south;

    private Subscription $subscription;

    private User $collector;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.business_timezone' => 'Asia/Gaza']);
        $this->travelTo(Carbon::parse('2026-10-01 10:00', 'Asia/Gaza'));
        $this->north = Branch::factory()->create(['name' => 'North']);
        $this->south = Branch::factory()->create(['name' => 'South']);
        $this->subscription = Subscription::factory()->create(['branch_id' => $this->north->id]);
        $this->collector = User::factory()->collector()->create(['name' => 'Sami', 'branch_id' => $this->north->id]);
    }

    public function test_the_days_flow_adds_up_from_what_was_owed_to_what_is_owed(): void
    {
        $this->at('2026-09-30 09:00', fn () => SubscriptionTransaction::recordCharge($this->subscription, $this->collector, ChargeType::Penalty, '100', 'late'));
        $this->at('2026-10-01 08:00', fn () => SubscriptionTransaction::recordCharge($this->subscription, $this->collector, ChargeType::DisconnectionFee, '30', null));
        $this->at('2026-10-01 08:10', fn () => $this->pay('40'));
        $this->at('2026-10-01 08:20', fn () => $this->pay('25', ['payment_method' => 'bank_transfer', 'bank_name' => 'Bank of Palestine', 'reference_number' => 'T-1']));
        $this->at('2026-10-01 08:30', fn () => SubscriptionTransaction::recordDiscount($this->subscription, $this->collector, DiscountMethod::Shekel, '5', null));
        $mistake = $this->at('2026-10-01 08:40', fn () => $this->pay('15'));
        $this->at('2026-10-01 08:45', fn () => $mistake->cancel($this->collector, CorrectionReason::Duplicate, null));
        $this->at('2026-10-01 09:00', fn () => $this->pay('999', [], Subscription::factory()->create(['branch_id' => $this->south->id])));

        $this->actingAs($this->preparer())->get(route('reports.index'))->assertInertia(fn ($page) => $page
            ->component('Reports/Index')
            ->where('filters', ['branch' => $this->north->id, 'from' => '2026-10-01', 'to' => '2026-10-01', 'kind' => 'all'])
            ->where('flow.opening', '100.00')
            ->where('flow.charges', [['type' => 'disconnection_fee', 'label' => __(ChargeType::DisconnectionFee->label()), 'count' => 1, 'total' => '30.00']])
            ->where('flow.creditsTotal', '70.00')
            ->where('flow.corrections', ['count' => 1, 'total' => '0.00'])
            ->where('flow.closing', '60.00')
            ->where('collections.total', '65.00')
            ->where('collections.cash', '40.00')
            ->where('collections.accounts', [
                ['key' => 'cash', 'label' => 'الصندوق النقدي', 'count' => 1, 'total' => '40.00'],
                ['key' => 'Bank of Palestine', 'label' => 'Bank of Palestine', 'count' => 1, 'total' => '25.00'],
            ])
            ->where('collections.collectors', [['name' => 'Sami', 'count' => 2, 'total' => '65.00', 'cash' => '40.00']])
            ->where('check.state', 'open')
            ->where('check.reportCash', '40.00')
            ->has('transactions.data', 6));
    }

    public function test_a_past_period_keeps_its_figures_when_a_line_is_cancelled_later(): void
    {
        $payment = $this->at('2026-09-29 10:00', fn () => $this->pay('80'));
        $this->at('2026-09-30 10:00', fn () => $payment->cancel($this->collector, CorrectionReason::NotReceived, null));
        $this->actingAs($this->preparer());

        $this->get(route('reports.index', ['from' => '2026-09-29', 'to' => '2026-09-29']))->assertInertia(fn ($page) => $page
            ->where('flow.creditsTotal', '80.00')
            ->where('flow.corrections.total', '0.00')
            ->where('flow.closing', '-80.00'));
        $this->get(route('reports.index', ['from' => '2026-09-29', 'to' => '2026-09-30']))->assertInertia(fn ($page) => $page
            ->where('flow.creditsTotal', '80.00')
            ->where('flow.corrections.total', '80.00')
            ->where('flow.closing', '0.00')
            ->where('days', fn ($days): bool => collect($days)->map(fn ($day) => [$day['day'], $day['payments'], $day['corrections'], $day['balance']])->all() === [
                ['2026-09-29', '80.00', '0.00', '-80.00'],
                ['2026-09-30', '0.00', '80.00', '0.00'],
            ]));
    }

    public function test_a_closed_day_shows_its_closing_and_whether_it_holds_every_cash_payment(): void
    {
        $this->at('2026-09-30 10:00', fn () => $this->pay('120'));
        $closing = Closing::dailyFor($this->north, '2026-09-30');
        $closing->syncPayments();
        $this->actingAs($this->preparer());

        $this->get(route('reports.index', ['from' => '2026-09-30', 'to' => '2026-09-30']))->assertInertia(fn ($page) => $page
            ->where('check.state', ClosingStatus::Draft->value)
            ->where('check.number', $closing->number)
            ->where('check.closingCash', '120.00')
            ->where('check.matches', true));

        $this->at('2026-09-30 11:00', fn () => $this->pay('30'));

        $this->get(route('reports.index', ['from' => '2026-09-30', 'to' => '2026-09-30']))->assertInertia(fn ($page) => $page
            ->where('check.reportCash', '150.00')
            ->where('check.matches', false));
        $this->get(route('reports.index', ['from' => '2026-09-29', 'to' => '2026-09-29']))->assertInertia(fn ($page) => $page->where('check.state', 'none'));
    }

    public function test_the_readings_entered_approved_and_still_pending_are_counted(): void
    {
        MeterReading::factory()->for($this->subscription)->create(['consumption' => 40]);
        MeterReading::factory()->for($this->subscription)->approved()->create(['week_start' => '2026-09-18', 'week_end' => '2026-09-24', 'consumption' => 10, 'amount_due' => '25.50', 'approved_at' => now()]);
        MeterReading::factory()->for(Subscription::factory()->create(['branch_id' => $this->south->id]))->create();

        $this->actingAs($this->preparer())->get(route('reports.index'))->assertInertia(fn ($page) => $page
            ->where('readings', ['entered' => 2, 'consumption' => 50, 'approved' => 1, 'billed' => '25.50', 'pending' => 1]));
    }

    public function test_a_preparer_reports_only_on_their_own_branch_and_an_auditor_on_all(): void
    {
        $this->at('2026-10-01 08:00', fn () => $this->pay('10'));
        $this->at('2026-10-01 08:00', fn () => $this->pay('20', [], Subscription::factory()->create(['branch_id' => $this->south->id])));

        $this->actingAs($this->preparer())->get(route('reports.index', ['branch' => $this->south->id]))->assertInertia(fn ($page) => $page
            ->where('filters.branch', $this->north->id)
            ->where('collections.total', '10.00'));
        $this->get(route('reports.index', ['branch' => 'all']))->assertInertia(fn ($page) => $page->where('collections.total', '10.00'));
        $this->assertStringNotContainsString('South', $this->get(route('reports.export'))->streamedContent());

        $auditor = User::factory()->financialAuditor()->create(['branch_id' => $this->north->id]);
        $auditor->permissions()->sync(Permission::idsFor([PermissionKey::ViewAllClosings, PermissionKey::ExportFinancialReports]));

        $this->actingAs($auditor)->get(route('reports.index', ['branch' => 'all']))->assertInertia(fn ($page) => $page
            ->where('filters.branch', 'all')
            ->where('scopeLabel', 'كل الفروع')
            ->where('collections.total', '30.00'));
    }

    public function test_someone_who_cannot_open_the_closings_cannot_open_the_reports(): void
    {
        $this->actingAs($this->collector)->get(route('reports.index'))->assertForbidden();
        $this->get(route('reports.export'))->assertForbidden();
    }

    public function test_the_lines_download_as_csv_narrowed_to_one_kind(): void
    {
        $this->at('2026-10-01 08:00', fn () => SubscriptionTransaction::recordCharge($this->subscription, $this->collector, ChargeType::Penalty, '100', 'late'));
        $payment = $this->at('2026-10-01 08:10', fn () => $this->pay('40'));
        $this->actingAs($this->preparer());

        $csv = $this->get(route('reports.export', ['kind' => 'payments']))->assertOk()->streamedContent();

        $this->assertStringStartsWith("\u{FEFF}التاريخ,الوقت,الفرع", $csv);
        $this->assertStringContainsString($payment->printedVoucherNumber(), $csv);
        $this->assertStringNotContainsString(__(ChargeType::Penalty->label()), $csv);
        $this->get(route('reports.index', ['kind' => 'charges']))->assertInertia(fn ($page) => $page
            ->where('transactions.data', fn ($lines): bool => collect($lines)->pluck('type')->all() === ['penalty']));
    }

    public function test_a_period_is_valid_and_at_most_a_quarter_and_never_past_today(): void
    {
        $this->actingAs($this->preparer());

        $this->get(route('reports.index', ['from' => '2026-01-01', 'to' => '2026-09-30']))
            ->assertSessionHasErrors(['from' => 'اختر فترة صحيحة لا تزيد على ثلاثة أشهر ولا تتجاوز اليوم.']);
        $this->get(route('reports.index', ['from' => '2026-09-30', 'to' => '2026-12-31']))
            ->assertInertia(fn ($page) => $page->where('filters.to', '2026-10-01'));
    }

    public function test_report_presents_weekly_and_monthly_periods_without_changing_the_filter_shape(): void
    {
        $this->actingAs($this->preparer());

        $this->get(route('reports.index', [
            'from' => '2026-09-26', 'to' => '2026-10-01', 'view' => 'weekly',
        ]))->assertInertia(fn ($page) => $page
            ->where('period.mode', 'weekly')
            ->where('filters', ['branch' => $this->north->id, 'from' => '2026-09-26', 'to' => '2026-10-01', 'kind' => 'all']));

        $this->get(route('reports.index', [
            'from' => '2026-10-01', 'to' => '2026-10-01', 'view' => 'monthly',
        ]))->assertInertia(fn ($page) => $page->where('period.mode', 'monthly'));
    }

    private function preparer(): User
    {
        $user = User::factory()->accountant()->create(['branch_id' => $this->north->id]);
        $user->permissions()->sync(Permission::idsFor([PermissionKey::PrepareClosings, PermissionKey::ExportFinancialReports]));

        return $user;
    }

    /**
     * @param  array<string, string>  $details
     */
    private function pay(string $amount, array $details = [], ?Subscription $subscription = null): SubscriptionTransaction
    {
        return SubscriptionTransaction::recordPayment($subscription ?? $this->subscription, $this->collector, [
            'amount' => $amount, 'currency' => 'ILS', 'payment_method' => 'cash', ...$details,
        ]);
    }

    /**
     * @template TResult
     *
     * @param  callable(): TResult  $record
     * @return TResult
     */
    private function at(string $moment, callable $record): mixed
    {
        $this->travelTo(Carbon::parse($moment, 'Asia/Gaza'));
        $result = $record();
        $this->travelTo(Carbon::parse('2026-10-01 10:00', 'Asia/Gaza'));

        return $result;
    }
}
