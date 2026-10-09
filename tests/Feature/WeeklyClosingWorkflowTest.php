<?php

namespace Tests\Feature;

use App\Enums\ClosingPeriodStatus;
use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\ClosingPeriod;
use App\Models\ClosingSetting;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Support\ClosingAdjustmentService;
use App\Support\WeeklyClosingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class WeeklyClosingWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.business_timezone' => 'Asia/Hebron']);
        $this->travelTo(Carbon::parse('2026-09-28 09:00', 'Asia/Hebron'));
    }

    /** @return array{SubscriptionTransaction, Closing, User} */
    private function closedPayment(string $amount = '100.00'): array
    {
        $actor = User::factory()->superAdmin()->create();
        $branch = Branch::factory()->create();
        $subscription = Subscription::factory()->create(['branch_id' => $branch->id]);
        $payment = SubscriptionTransaction::recordPayment($subscription, $actor, ['amount' => $amount, 'currency' => 'ILS', 'payment_method' => 'cash']);
        Closing::factory()->approved()->forDay('2026-09-28')->create(['branch_id' => $branch->id]);
        $this->travelTo(Carbon::parse('2026-10-05 10:00', 'Asia/Hebron'));
        $this->actingAs($actor)->post(route('period-closings.store'), ['period' => 'weekly', 'date' => '2026-09-28'])->assertSessionHasNoErrors();

        return [$payment->refresh(), Closing::where('number', 'W-2026-39')->sole(), $actor];
    }

    public function test_final_close_stores_details_once_and_duplicate_requests_cannot_duplicate_them(): void
    {
        [$payment, $closing, $actor] = $this->closedPayment();

        $this->actingAs($actor)->post(route('period-closings.store'), ['period' => 'weekly', 'date' => '2026-09-28'])->assertSessionHasErrors('period');

        $this->assertSame('100.00', $closing->snapshot['report']['actualCollectionTotal']);
        $this->assertDatabaseCount('closing_snapshot_lines', 1);
        $this->assertSame(ClosingPeriodStatus::Closed, ClosingPeriod::findOrFail($payment->closing_period_id)->status);
        $this->assertSame(1, Closing::where('number', $closing->number)->count());
    }

    #[TestWith(['100.00', '50.00', '50.00'])]
    #[TestWith(['50.00', '100.00', '-50.00'])]
    public function test_payment_corrections_change_only_the_current_ledger_and_keep_the_snapshot(string $originalAmount, string $correctAmount, string $delta): void
    {
        [$payment, $closing, $actor] = $this->closedPayment($originalAmount);
        $snapshot = $closing->snapshot;

        $this->post(route('subscriptions.transactions.actions.store', [$payment->subscription_id, $payment]), ['action' => 'correction', 'amount' => $correctAmount, 'amendment_reason' => 'Audit verified the receipt'])->assertSessionHasNoErrors();

        $adjustment = SubscriptionTransaction::where('adjustment_type', 'correction')->sole();
        $this->assertSame($delta, $adjustment->amount);
        $this->assertSame('0.00', $adjustment->cash_effect_amount);
        $this->assertSame($payment->id, $adjustment->reference_transaction_id);
        $this->assertSame($snapshot, $closing->fresh()->snapshot);
        $this->assertSame('-'.$originalAmount, $payment->fresh()->amount);
        $report = app(WeeklyClosingService::class)->report(ClosingPeriod::findOrFail($adjustment->closing_period_id));
        $this->assertSame('0.00', $report['actualCollectionTotal']);
        $this->assertSame($delta, $report['previousPeriodAdjustmentsTotal']);
        $this->assertSame(ClosingPeriodStatus::Open, ClosingPeriod::findOrFail($adjustment->closing_period_id)->status);
        $this->get(route('subscriptions.statement', $payment->subscription_id))->assertInertia(fn ($page) => $page
            ->where('entries.1.closingAdjustment.originalId', $payment->id)->where('entries.1.closingAdjustment.cashEffect', '0.00')
            ->where('entries.1.isCorrection', true));
    }

    public function test_false_payment_reversal_preserves_original_and_has_no_cash_effect(): void
    {
        [$payment, $closing, $actor] = $this->closedPayment();

        $this->post(route('subscriptions.transactions.actions.store', [$payment->subscription_id, $payment]), ['action' => 'reverse', 'amendment_reason' => 'No payment took place'])->assertSessionHasNoErrors();

        $reversal = SubscriptionTransaction::where('adjustment_type', 'reversal')->sole();
        $this->assertSame('100.00', $reversal->amount);
        $this->assertSame('0.00', $reversal->cash_effect_amount);
        $this->assertSame(0.0, $payment->subscription->balance());
        $this->assertNull($payment->fresh()->cancelled_at);
        $this->assertModelExists($payment);
    }

    #[TestWith(['amount', '-70.00'])]
    #[TestWith(['notes', 'Changed receipt'])]
    public function test_closed_transactions_reject_direct_mutation(string $field, string $value): void
    {
        [$payment] = $this->closedPayment();
        $this->expectException(ValidationException::class);

        $payment->update([$field => $value]);
    }

    public function test_closed_transactions_reject_direct_deletion(): void
    {
        [$payment] = $this->closedPayment();
        $this->expectException(ValidationException::class);

        $payment->delete();
    }

    public function test_closed_period_rejects_backdated_insertion(): void
    {
        [$payment] = $this->closedPayment();
        $this->expectException(ValidationException::class);

        SubscriptionTransaction::factory()->create(['subscription_id' => $payment->subscription_id, 'source_key' => 'backdated', 'created_at' => $payment->created_at]);
    }

    public function test_late_payment_preserves_both_dates_and_counts_in_the_current_week(): void
    {
        [$original, $closing, $actor] = $this->closedPayment();

        $payment = SubscriptionTransaction::recordPayment($original->subscription, $actor, ['amount' => '75.00', 'currency' => 'ILS', 'payment_method' => 'cash', 'actual_at' => '2026-09-29 09:00', 'adjustment_reason' => 'Receipt entered late']);

        $this->assertTrue($payment->is_late_entry);
        $this->assertNotSame($original->closing_period_id, $payment->closing_period_id);
        $this->assertSame('2026-09-29', $payment->actual_at->timezone('Asia/Hebron')->toDateString());
        $this->assertSame('2026-10-05', $payment->recorded_at->timezone('Asia/Hebron')->toDateString());
        $report = app(WeeklyClosingService::class)->report(ClosingPeriod::findOrFail($payment->closing_period_id));
        $this->assertSame('75.00', $report['actualCollectionTotal']);
        $this->assertSame('75.00', $report['lateEntriesTotal']);
        $this->assertSame('100.00', $closing->fresh()->snapshot['report']['actualCollectionTotal']);
    }

    public function test_adjustment_reason_is_required_and_ordinary_edit_is_unavailable(): void
    {
        [$payment, $closing, $actor] = $this->closedPayment();

        $this->post(route('subscriptions.transactions.actions.store', [$payment->subscription_id, $payment]), ['action' => 'correction', 'amount' => '50.00'])->assertSessionHasErrors('amendment_reason');
        $this->assertSame(['correction', 'reverse', 'refund'], $payment->availableActions($actor));
    }

    public function test_user_without_adjustment_permission_cannot_correct_a_closed_payment(): void
    {
        [$payment] = $this->closedPayment();
        $actor = User::factory()->accountant()->withPermissions([PermissionKey::ViewSubscriptions])->create(['branch_id' => $payment->branch_id]);

        $this->actingAs($actor)->post(route('closing-adjustments.store', [$payment->subscription_id, $payment]), ['adjustment_type' => 'correction', 'amount' => '50.00', 'reason' => 'Audit'])->assertForbidden();

        $this->assertSame(0, SubscriptionTransaction::whereNotNull('adjustment_type')->count());
    }

    public function test_cutoff_prepares_a_week_without_automatically_closing_it(): void
    {
        $period = app(WeeklyClosingService::class)->forDate('2026-09-28');
        $this->travelTo($period->cutoff_at->addMinute());

        $this->artisan('closings:prepare')->assertSuccessful();

        $this->assertSame(ClosingPeriodStatus::ReadyToClose, $period->fresh()->status);
        $this->assertDatabaseCount('closings', 0);
        $this->assertDatabaseHas('closing_events', ['closing_period_id' => $period->id, 'action' => 'PERIOD_PREPARED']);
    }

    public function test_schedule_change_does_not_change_closed_period_boundaries_or_report(): void
    {
        [$payment, $closing, $actor] = $this->closedPayment();
        $period = ClosingPeriod::findOrFail($payment->closing_period_id);
        $snapshot = $closing->snapshot;

        $this->put(route('settings.closing-schedule.update'), ['cutoff_time' => '18:00', 'week_starts_on' => 0, 'auto_open' => true, 'weekly_closing_day' => 4, 'weekly_closing_time' => '15:00', 'weekly_timezone' => 'Asia/Hebron', 'grace_period_minutes' => 30, 'reason' => 'New schedule'])->assertSessionHasNoErrors();

        $this->assertTrue($period->cutoff_at->equalTo($period->fresh()->cutoff_at));
        $this->assertSame($snapshot, $closing->fresh()->snapshot);
        $this->assertDatabaseHas('closing_setting_events', ['user_id' => $actor->id, 'reason' => 'New schedule']);
        $this->get(route('closings.index', ['tab' => 'period', 'date' => '2026-09-28']))->assertInertia(fn ($page) => $page->where('periodView.financialReport.actualCollectionTotal', '100.00')->where('periodView.canApprove', false));
    }

    public function test_audit_records_discrepancies_without_changing_the_snapshot(): void
    {
        [$payment, $closing, $actor] = $this->closedPayment();
        $snapshot = $closing->snapshot;
        $period = ClosingPeriod::findOrFail($payment->closing_period_id);
        $this->put(route('closing-periods.audit', $period), ['action' => 'send_to_audit'])->assertSessionHasNoErrors();

        $this->put(route('closing-periods.audit', $period), ['action' => 'mark_audited', 'counted_cash' => '90.00', 'verified_bank' => 0, 'verified_wallets' => 0, 'verified_other' => 0, 'notes' => 'Cash shortage under investigation'])->assertSessionHasNoErrors();

        $this->assertSame(ClosingPeriodStatus::Audited, $period->fresh()->status);
        $this->assertSame('-10.00', $period->fresh()->reconciliation['cash']['difference']);
        $this->assertSame($snapshot, $closing->fresh()->snapshot);
    }

    public function test_closed_snapshot_cannot_be_overwritten(): void
    {
        [, $closing] = $this->closedPayment();
        $this->expectException(ValidationException::class);

        $closing->update(['snapshot' => ['report' => []]]);
    }

    public function test_custom_thursday_cutoff_assigns_after_cutoff_payments_to_the_next_week(): void
    {
        ClosingSetting::current()->update(['weekly_closing_day' => 4, 'weekly_closing_time' => '15:00', 'weekly_timezone' => 'Asia/Hebron', 'grace_period_minutes' => 30]);
        $actor = User::factory()->superAdmin()->create();
        $subscription = Subscription::factory()->create();
        $this->travelTo(Carbon::parse('2026-10-08 14:59', 'Asia/Hebron'));
        $first = SubscriptionTransaction::recordPayment($subscription, $actor, ['amount' => '100', 'currency' => 'ILS', 'payment_method' => 'cash']);
        $period = ClosingPeriod::findOrFail($first->closing_period_id);
        $this->assertSame('2026-10-08 15:00', $period->cutoff_at->timezone('Asia/Hebron')->format('Y-m-d H:i'));
        $this->assertSame('2026-10-08 15:30', $period->eligible_at->timezone('Asia/Hebron')->format('Y-m-d H:i'));
        $this->travelTo(Carbon::parse('2026-10-08 15:00', 'Asia/Hebron'));

        $second = SubscriptionTransaction::recordPayment($subscription, $actor, ['amount' => '50', 'currency' => 'ILS', 'payment_method' => 'cash']);

        $this->assertNotSame($first->closing_period_id, $second->closing_period_id);
        $this->assertSame('100.00', app(WeeklyClosingService::class)->report($period)['actualCollectionTotal']);
        $this->assertSame('50.00', app(WeeklyClosingService::class)->report(ClosingPeriod::findOrFail($second->closing_period_id))['actualCollectionTotal']);
    }

    public function test_channel_totals_and_counts_separate_cash_banks_and_wallets(): void
    {
        $actor = User::factory()->superAdmin()->create();
        $subscription = Subscription::factory()->create();
        SubscriptionTransaction::recordPayment($subscription, $actor, ['amount' => '10000', 'currency' => 'ILS', 'payment_method' => 'cash']);
        SubscriptionTransaction::recordPayment($subscription, $actor, ['amount' => '7000', 'currency' => 'ILS', 'payment_method' => 'bank_transfer', 'bank_name' => 'بنك فلسطين']);
        SubscriptionTransaction::recordPayment($subscription, $actor, ['amount' => '2000', 'currency' => 'ILS', 'payment_method' => 'bank_transfer', 'bank_name' => 'جوال باي']);
        SubscriptionTransaction::recordPayment($subscription, $actor, ['amount' => '1000', 'currency' => 'ILS', 'payment_method' => 'bank_transfer', 'bank_name' => 'محفظة بالباي']);

        $report = app(WeeklyClosingService::class)->report(app(WeeklyClosingService::class)->forMoment(now()));

        $this->assertSame('20000.00', $report['actualCollectionTotal']);
        $this->assertSame('10000.00', $report['cashTotal']);
        $this->assertSame('7000.00', $report['bankTotal']);
        $this->assertSame('3000.00', $report['walletTotal']);
        $this->assertSame(4, $report['paymentCount']);
        $this->assertSame([1, 1, 1, 1], array_column($report['methods'], 'count'));
    }

    #[TestWith(['meter_reading', '200.00', '150.00', '-50.00'])]
    #[TestWith(['meter_reading', '150.00', '200.00', '50.00'])]
    #[TestWith(['disconnection_fee', '50.00', '0.00', '-50.00'])]
    #[TestWith(['penalty', '30.00', '20.00', '-10.00'])]
    public function test_closed_reading_fee_and_penalty_corrections_have_no_collection_effect(string $type, string $amount, string $correct, string $delta): void
    {
        $actor = User::factory()->superAdmin()->create();
        $original = SubscriptionTransaction::factory()->create(['type' => $type, 'amount' => $amount]);
        $this->travelTo(Carbon::parse('2026-10-05 10:00', 'Asia/Hebron'));
        $this->actingAs($actor)->post(route('period-closings.store'), ['period' => 'weekly', 'date' => '2026-09-28'])->assertSessionHasNoErrors();

        $adjustment = app(ClosingAdjustmentService::class)->adjust($original, $actor, 'correction', $correct, 'Verified charge');

        $this->assertSame($delta, $adjustment->amount);
        $this->assertSame('0.00', $adjustment->cash_effect_amount);
        $this->assertSame($amount, $original->fresh()->amount);
        $this->assertSame((float) $correct, $original->subscription->balance());
    }

    public function test_snapshot_lines_cannot_be_deleted(): void
    {
        [, $closing] = $this->closedPayment();
        $this->expectException(ValidationException::class);

        $closing->snapshotLines()->sole()->delete();
    }

    public function test_audit_requires_a_reason_for_discrepancies(): void
    {
        [$payment] = $this->closedPayment();
        $period = ClosingPeriod::findOrFail($payment->closing_period_id);
        $this->put(route('closing-periods.audit', $period), ['action' => 'send_to_audit'])->assertSessionHasNoErrors();

        $this->put(route('closing-periods.audit', $period), ['action' => 'mark_audited', 'counted_cash' => '90', 'verified_bank' => 0, 'verified_wallets' => 0, 'verified_other' => 0])->assertSessionHasErrors(['notes' => 'وثّق سبب فروق المطابقة قبل إنهاء التدقيق.']);

        $this->assertSame(ClosingPeriodStatus::UnderAudit, $period->fresh()->status);
    }

    public function test_real_refund_of_a_closed_payment_is_a_current_cash_movement_and_preserves_history(): void
    {
        [$payment, $closing, $actor] = $this->closedPayment();
        $snapshot = $closing->snapshot;
        $this->post(route('subscriptions.transactions.actions.store', [$payment->subscription_id, $payment]), ['action' => 'correction', 'amount' => '50.00', 'amendment_reason' => 'Receipt verified'])->assertSessionHasNoErrors();

        $this->post(route('subscriptions.transactions.actions.store', [$payment->subscription_id, $payment]), ['action' => 'refund', 'correction_notes' => 'Actual cash returned to subscriber'])->assertSessionHasNoErrors();

        $refund = SubscriptionTransaction::where('type', SubscriptionTransaction::TYPE_REFUND)->sole();
        $this->assertSame('50.00', $refund->amount);
        $this->assertSame('-50.00', $refund->cash_effect_amount);
        $this->assertNull($payment->fresh()->cancelled_at);
        $this->assertSame($snapshot, $closing->fresh()->snapshot);
        $report = app(WeeklyClosingService::class)->report(ClosingPeriod::findOrFail($refund->closing_period_id));
        $this->assertSame('0.00', $report['actualCollectionTotal']);
        $this->assertSame('-50.00', $report['refundsTotal']);
        $this->assertSame('0.00', $report['chargesTotal']);
        $this->assertNotContains('refund', $payment->fresh()->availableActions($actor));
        $this->assertSame(0.0, $payment->subscription->balance());
    }

    public function test_branch_user_sees_only_their_part_of_the_frozen_report(): void
    {
        $actor = User::factory()->superAdmin()->create();
        $branch = Branch::factory()->create();
        $other = Branch::factory()->create();
        foreach ([$branch->id => '100', $other->id => '250'] as $branchId => $amount) {
            $subscription = Subscription::factory()->create(['branch_id' => $branchId]);
            SubscriptionTransaction::recordPayment($subscription, $actor, ['amount' => $amount, 'currency' => 'ILS', 'payment_method' => 'cash']);
            Closing::factory()->approved()->forDay('2026-09-28')->create(['branch_id' => $branchId, 'counted_cash' => $branchId === $branch->id ? '10.00' : '60.00']);
        }
        $this->travelTo(Carbon::parse('2026-10-05 10:00', 'Asia/Hebron'));
        $this->actingAs($actor)->post(route('period-closings.store'), ['period' => 'weekly', 'date' => '2026-09-28'])->assertSessionHasNoErrors();
        $viewer = User::factory()->accountant()->withPermissions([PermissionKey::ViewOwnClosings])->create(['branch_id' => $branch->id]);

        $this->actingAs($viewer)->get(route('closings.index', ['tab' => 'period', 'date' => '2026-09-28']))->assertInertia(fn ($page) => $page
            ->where('periodView.collected', '100.00')->has('periodView.rows', 1)->has('periodView.financialReport.lines', 1)
            ->where('periodView.needed', 1)->where('periodView.unapproved', 0)->has('periodView.differences', 1)->where('periodView.differenceTotal', '10.00')
            ->where('periodView.reconciliation', null)->where('periodView.canAudit', false));
    }

    public function test_snapshot_rejects_an_extra_transaction_not_present_in_the_frozen_report(): void
    {
        [$payment, $closing, $actor] = $this->closedPayment();
        $extra = SubscriptionTransaction::recordPayment($payment->subscription, $actor, ['amount' => '20', 'currency' => 'ILS', 'payment_method' => 'cash']);
        $this->expectException(ValidationException::class);

        $closing->snapshotLines()->create(['subscription_transaction_id' => $extra->id, 'classification' => 'payment', 'ledger_effect' => '-20.00', 'collection_effect' => '20.00', 'details' => []]);
    }

    public function test_schedule_transition_creates_contiguous_unique_periods_even_in_the_same_iso_week(): void
    {
        ClosingSetting::current()->update(['weekly_closing_day' => 3, 'weekly_closing_time' => '00:00']);
        $actor = User::factory()->superAdmin()->create();
        $subscription = Subscription::factory()->create();
        $this->travelTo(Carbon::parse('2026-10-09 10:00', 'Asia/Hebron'));
        $first = SubscriptionTransaction::recordPayment($subscription, $actor, ['amount' => '100', 'currency' => 'ILS', 'payment_method' => 'cash']);
        ClosingSetting::current()->update(['weekly_closing_day' => 4, 'weekly_closing_time' => '15:00']);
        $this->travelTo(Carbon::parse('2026-10-15 10:00', 'Asia/Hebron'));
        $transition = SubscriptionTransaction::recordPayment($subscription, $actor, ['amount' => '50', 'currency' => 'ILS', 'payment_method' => 'cash']);
        $this->travelTo(Carbon::parse('2026-10-15 15:00', 'Asia/Hebron'));

        $next = SubscriptionTransaction::recordPayment($subscription, $actor, ['amount' => '25', 'currency' => 'ILS', 'payment_method' => 'cash']);

        $service = app(WeeklyClosingService::class);
        $old = ClosingPeriod::findOrFail($first->closing_period_id);
        $short = ClosingPeriod::findOrFail($transition->closing_period_id);
        $future = ClosingPeriod::findOrFail($next->closing_period_id);
        $this->assertTrue($old->cutoff_at->equalTo($short->starts_at));
        $this->assertTrue($short->cutoff_at->equalTo($future->starts_at));
        $this->assertNotSame($short->number, $future->number);
        $this->assertSame('50.00', $service->report($short)['actualCollectionTotal']);
        $this->assertSame('25.00', $service->report($future)['actualCollectionTotal']);
    }
}
