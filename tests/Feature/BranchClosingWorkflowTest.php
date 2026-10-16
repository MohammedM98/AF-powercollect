<?php

namespace Tests\Feature;

use App\Enums\TransactionAction;
use App\Models\AuditNote;
use App\Models\Branch;
use App\Models\CashBox;
use App\Models\CashBoxPayment;
use App\Models\CashTransfer;
use App\Models\Closing;
use App\Models\ClosingSetting;
use App\Models\CollectorDebt;
use App\Models\MobileAccessToken;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Support\BranchClosingWorkflow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class BranchClosingWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private function start(): array
    {
        $this->travelTo(now()->setDate(2026, 10, 11)->setTime(10, 0));
        $branch = Branch::factory()->create();
        $head = User::factory()->branchAdmin()->for($branch)->create();
        $collector = User::factory()->collector()->for($branch)->create();
        $this->actingAs($head)->post(route('closings.actions', ['action' => 'start']), ['branch_id' => $branch->id])->assertSessionHasNoErrors();

        return [$branch, $head, $collector];
    }

    private function payment(Branch $branch, User $collector, string $amount = '100', string $currency = 'ILS', string $method = 'cash', array $extra = []): SubscriptionTransaction
    {
        return SubscriptionTransaction::factory()->for(Subscription::factory()->for($branch)->create())->create(['recorded_by' => $collector->id, 'type' => 'payment', 'source_key' => 'payment:'.Str::ulid(), 'amount' => '-'.$amount, 'currency_amount' => $amount, 'currency' => $currency, 'payment_method' => $method, ...$extra]);
    }

    /** Confirming a box's close says the cash was counted, unless `$data` says otherwise. */
    private function action(User $actor, Branch $branch, string $action, int $record, array $data = []): TestResponse
    {
        return $this->actingAs($actor)->post(route('closings.actions', ['action' => $action, 'record' => $record]), ['branch_id' => $branch->id, ...($action === 'receive' ? ['cash_counted' => true] : []), ...$data]);
    }

    private function counts(string $ils = '100', string $usd = '0', string $jod = '0'): array
    {
        return ['ILS' => $ils, 'USD' => $usd, 'JOD' => $jod];
    }

    private function receiveBox(Branch $branch, User $head, CashBox $box): void
    {
        $this->action($head, $branch, 'receive', $box->id)->assertSessionHasNoErrors();
    }

    public function test_page_requires_authentication_and_branch_access(): void
    {
        $this->get(route('closings.index'))->assertRedirect(route('login'));
        $this->actingAs(User::factory()->dataEntry()->create())->get(route('closings.index'))->assertForbidden();
    }

    public function test_start_preserves_historical_closings_and_ignores_old_payments(): void
    {
        $branch = Branch::factory()->create();
        $head = User::factory()->branchAdmin()->for($branch)->create();
        $legacy = Closing::factory()->for($branch)->submitted()->create();
        $this->payment($branch, $head, extra: ['created_at' => now()->subWeek()]);

        $this->actingAs($head)->post(route('closings.actions', ['action' => 'start']), ['branch_id' => $branch->id])->assertSessionHasNoErrors();

        $this->assertNull($legacy->fresh()->workflow_settings);
        $this->assertSame('submitted', $legacy->fresh()->status->value);
        $this->assertDatabaseCount('cash_box_payments', 0);
        $this->assertSame('weekly', ClosingSetting::ownFor($branch)->frequency);
    }

    public function test_branch_confirms_a_collectors_box_closed_in_one_step_and_new_payments_open_another(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector, '100');
        $this->payment($branch, $collector, '10', 'USD');
        $box = CashBox::query()->sole();

        $this->action($collector, $branch, 'close', $box->id)->assertForbidden();
        $this->action($head, $branch, 'receive', $box->id)->assertSessionHasNoErrors();
        $this->payment($branch, $collector, '5', 'JOD');

        $box->refresh();
        $this->assertSame('received', $box->status);
        $this->assertSame('manual', $box->close_reason);
        $this->assertSame($head->id, $box->received_by);
        $this->assertNotNull($box->confirmed_at);
        // The dollars count at their value in shekels: boxes hold shekels only.
        $this->assertSame(['ILS' => '110.00', 'USD' => '0.00', 'JOD' => '0.00'], $box->expected_counts);
        $this->assertSame($box->expected_counts, $box->head_counts);
        $this->assertSame(1, CashBox::query()->where('user_id', $collector->id)->where('status', 'open')->count());
        $this->assertSame(2, $box->payments()->count());
    }

    public function test_empty_boxes_are_rejected_and_branch_admin_can_confirm_own_box(): void
    {
        [$branch, $head] = $this->start();
        $this->payment($branch, $head);
        $box = CashBox::query()->sole();
        $empty = CashBox::factory()->create(['branch_id' => $branch->id, 'user_id' => User::factory()->collector()->for($branch)->create()->id, 'closing_id' => $box->closing_id, 'status' => 'open']);

        $this->action($head, $branch, 'receive', $empty->id)->assertSessionHasErrors('action');
        $this->action($head, $branch, 'receive', $box->id)->assertSessionHasNoErrors();

        $this->assertSame('received', $box->fresh()->status);
        $this->assertSame('100.00', $box->fresh()->head_counts['ILS']);
    }

    public function test_cross_branch_requests_cannot_change_sessions(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $outsider = User::factory()->branchAdmin()->create();

        $this->action($outsider, $branch, 'receive', $box->id)->assertNotFound();
        $this->action($outsider, $outsider->branch, 'receive', $box->id)->assertNotFound();

        $this->assertSame('open', $box->fresh()->status);
    }

    public function test_branch_sees_every_amount_before_confirming_the_close(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);

        $this->actingAs($head)->get(route('closings.index'))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('boxes.0.status', 'open')->where('boxes.0.payments.0.amount', '100.00'));
    }

    public function test_confirmed_cash_box_enters_the_safe_and_a_debt_repayment_adds_to_it(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $this->receiveBox($branch, $head, $box);
        $debt = CollectorDebt::query()->create(['cash_box_id' => $box->id, 'branch_id' => $branch->id, 'user_id' => $collector->id, 'currency' => 'ILS', 'amount' => '10.00', 'remaining' => '10.00']);

        $this->assertSame('100.00', app(BranchClosingWorkflow::class)->balance($branch->id)['ILS']);
        $this->action($head, $branch, 'repay', $debt->id, ['amount' => '5'])->assertSessionHasNoErrors();
        $this->assertSame('5.00', $debt->fresh()->remaining);
        $this->assertSame('105.00', app(BranchClosingWorkflow::class)->balance($branch->id)['ILS']);
    }

    public function test_cutoff_closes_sessions_and_boundary_payment_enters_next_period(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $closing = $box->closing;

        $this->travelTo($closing->coverage_until);
        $this->payment($branch, $collector, '7');

        $this->assertSame('pending', $box->fresh()->status);
        $this->assertSame('cutoff', $box->fresh()->close_reason);
        $next = app(BranchClosingWorkflow::class)->current($branch->id);
        $this->assertTrue($next->coverage_from->equalTo($closing->coverage_until));
        $this->assertSame(1, CashBoxPayment::query()->whereHas('box', fn ($query) => $query->where('closing_id', $next->id))->count());
    }

    public function test_a_branch_holding_cash_sends_its_week_and_the_snapshot_remains_frozen(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $closing = $box->closing;
        $this->receiveBox($branch, $head, $box);
        $this->travelTo($closing->coverage_until);

        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();
        $snapshot = $closing->fresh()->submitted_snapshot;
        $this->payment($branch, $collector, '9');

        $this->assertSame($snapshot, $closing->fresh()->submitted_snapshot);
        $this->assertSame('submitted', $closing->fresh()->status->value);
        $this->assertDatabaseCount('closing_versions', 1);
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasErrors('action');
    }

    public function test_a_week_sent_to_the_audit_can_never_be_taken_back(): void
    {
        [$branch, $head] = $this->start();
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);
        $this->travelTo($closing->coverage_until);
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();
        $snapshot = $closing->fresh()->submitted_snapshot;

        $this->action($head, $branch, 'withdraw', $closing->id)->assertForbidden();
        $this->action(User::factory()->superAdmin()->create(), $branch, 'withdraw', $closing->id)->assertForbidden();
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasErrors('action');

        $this->assertSame('submitted', $closing->fresh()->status->value);
        $this->assertSame($snapshot, $closing->fresh()->submitted_snapshot);
        $this->assertDatabaseCount('closing_versions', 1);
    }

    public function test_early_closing_joins_the_remaining_days_to_the_next_week(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);
        $originalEnd = $closing->coverage_until;
        $this->travel(1)->hours();

        $this->action($head, $branch, 'early', $closing->id)->assertSessionHasNoErrors();

        $next = app(BranchClosingWorkflow::class)->current($branch->id);
        $this->assertTrue($closing->fresh()->is_manual);
        $this->assertTrue($next->coverage_from->equalTo($closing->fresh()->coverage_until));
        $this->assertTrue($next->coverage_until->equalTo($originalEnd->addWeek()));
        $this->assertArrayNotHasKey('continuation', $next->workflow_settings);
        $this->assertSame('pending', CashBox::query()->sole()->status);
    }

    public function test_settings_apply_next_period_and_grants_apply_now(): void
    {
        [$branch, $head, $collector] = $this->start();
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);
        $originalEnd = $closing->coverage_until;
        $nextSettings = ['week_starts_on' => 2, 'cutoff_time' => '18:00'];

        $this->action($head, $branch, 'settings', 0, ['settings' => $nextSettings, 'receivers' => [$collector->id], 'approvers' => []])->assertSessionHasNoErrors();

        $this->assertTrue($closing->fresh()->coverage_until->equalTo($originalEnd));
        $this->assertSame('combined', ClosingSetting::ownFor($branch)->arrangement);
        $this->assertSame([$collector->id], ClosingSetting::ownFor($branch)->receivers);
        $this->travelTo($originalEnd);
        $this->artisan('closings:process')->assertSuccessful();
        $next = app(BranchClosingWorkflow::class)->current($branch->id);
        $this->assertTrue($next->coverage_from->equalTo($originalEnd));
        $this->assertSame('combined', $next->book);
        $this->assertSame(1, Closing::query()->where('coverage_from', $originalEnd)->count());
        $this->assertSame('combined', ClosingSetting::ownFor($branch)->arrangement);
    }

    public function test_late_payment_after_submission_enters_open_week(): void
    {
        [$branch, $head, $collector] = $this->start();
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);
        $occurred = now()->addHour();
        $this->travelTo($closing->coverage_until);
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true]);
        $snapshot = $closing->fresh()->submitted_snapshot;

        $this->payment($branch, $collector, extra: ['created_at' => $occurred]);

        $entry = CashBoxPayment::query()->sole();
        $this->assertTrue($entry->is_late);
        $this->assertNotSame($closing->id, $entry->box->closing_id);
        $this->assertSame($snapshot, $closing->fresh()->submitted_snapshot);
    }

    public function test_audit_adjustment_leaves_old_snapshot_unchanged(): void
    {
        [$branch, $head] = $this->start();
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);
        $this->travelTo($closing->coverage_until);
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true]);
        $note = AuditNote::factory()->create(['closing_id' => $closing->id]);
        $snapshot = $closing->fresh()->submitted_snapshot;

        $this->action($head, $branch, 'reply', $note->id, ['kind' => 'adjustment', 'body' => 'تصحيح فرق سابق', 'book' => 'cash', 'currency' => 'USD', 'amount' => '10'])->assertSessionHasNoErrors();

        $this->assertDatabaseHas('closing_adjustments', ['original_closing_id' => $closing->id, 'currency' => 'USD', 'amount' => '10']);
        $this->assertSame('awaiting_audit', $note->fresh()->status);
        $this->assertSame($snapshot, $closing->fresh()->submitted_snapshot);
    }

    public function test_a_reply_sent_with_the_page_s_empty_adjustment_fields_goes_to_the_audit(): void
    {
        [$branch, $head] = $this->start();
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);
        $this->travelTo($closing->coverage_until);
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true]);
        $note = AuditNote::factory()->create(['closing_id' => $closing->id]);

        $this->action($head, $branch, 'reply', $note->id, ['kind' => 'clarification', 'body' => 'وصلت الحوالة في اليوم التالي', 'book' => 'cash', 'currency' => 'ILS', 'amount' => ''])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'reply', AuditNote::factory()->create(['closing_id' => $closing->id])->id, ['kind' => 'adjustment', 'body' => 'تصحيح', 'book' => 'cash', 'currency' => 'ILS', 'amount' => ''])->assertSessionHasErrors('amount');

        $this->assertSame('awaiting_audit', $note->fresh()->status);
        $this->assertDatabaseCount('closing_adjustments', 0);
    }

    public function test_an_unconfirmed_legacy_receipt_is_a_warning(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $closing = $box->closing;
        $this->receiveBox($branch, $head, $box);
        // A box received under the old two-step receipt, its collector's confirmation still owed.
        $box->refresh()->update(['confirmed_at' => null]);
        $this->travelTo($closing->coverage_until);

        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();

        $this->assertNotNull($closing->fresh()->submitted_at);
        $this->assertContains('1 صندوق استُلم ولم يؤكّد صاحبه التسليم بعد.', $closing->fresh()->submitted_snapshot['warnings']);
    }

    public function test_late_payment_before_submission_creates_pending_box_in_ended_period(): void
    {
        [$branch, $head, $collector] = $this->start();
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);
        $occurred = now()->addHour();
        $this->travelTo($closing->coverage_until);

        $this->payment($branch, $collector, extra: ['created_at' => $occurred]);

        $box = CashBox::query()->sole();
        $this->assertSame('pending', $box->status);
        $this->assertSame($closing->id, $box->closing_id);
        $this->assertSame('late_sync', $box->close_reason);
        $this->assertFalse($box->payments()->sole()->is_late);
    }

    public function test_suspended_electronic_payment_is_confirmed_in_open_week_without_changing_snapshot(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector, method: 'bank_transfer');
        $box = CashBox::query()->sole();
        $closing = $box->closing;
        $entry = $box->payments()->sole();
        $this->action($head, $branch, 'electronic', $entry->id, ['status' => 'missing'])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'receive', $box->id)->assertSessionHasNoErrors();
        $this->travelTo($closing->coverage_until);
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();
        $snapshot = $closing->fresh()->submitted_snapshot;

        $this->action($head, $branch, 'electronic', $entry->id, ['status' => 'confirmed'])->assertSessionHasNoErrors();

        $this->assertSame(app(BranchClosingWorkflow::class)->current($branch->id)->id, $entry->fresh()->confirmed_in_closing_id);
        $this->assertSame($snapshot, $closing->fresh()->submitted_snapshot);
        $this->assertSame('0.00', app(BranchClosingWorkflow::class)->balance($branch->id)['ILS']);
    }

    public function test_delivering_cash_to_the_company_is_gone_and_past_deliveries_are_kept(): void
    {
        Storage::fake('local');
        [$branch, $head] = $this->start();
        $recipient = User::factory()->accountant()->create();
        $transfer = CashTransfer::factory()->create(['branch_id' => $branch->id, 'recipient_id' => $recipient->id, 'status' => 'in_transit']);
        $before = $transfer->fresh()->getAttributes();

        $this->action($head, $branch, 'transfer', 0, ['currency' => 'ILS', 'amount' => '40', 'method' => 'bank_deposit', 'recipient_id' => $recipient->id, 'proof' => UploadedFile::fake()->image('deposit.jpg')])->assertForbidden();
        $this->actingAs($recipient)->post("/reconciliation/transfer-receipts/{$transfer->id}")->assertNotFound();
        $this->actingAs($head)->get(route('closings.proofs', ['kind' => 'transfer', 'record' => $transfer->id]))->assertNotFound();

        $this->assertSame($before, $transfer->fresh()->getAttributes());
        $this->assertDatabaseCount('cash_transfers', 1);
    }

    public function test_mobile_session_only_lists_own_boxes(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $this->receiveBox($branch, $head, $box);
        $this->payment($branch, $head);
        $token = MobileAccessToken::issue($collector);

        $this->withToken($token)->getJson(route('mobile.cash-boxes.index'))->assertOk()->assertJsonCount(1, 'boxes')->assertJsonPath('boxes.0.user_id', $collector->id);
        $this->withToken($token)->postJson(route('mobile.cash-boxes.actions', ['action' => 'head-count', 'record' => $box->id]), ['branch_id' => $branch->id, 'counts' => $this->counts()])->assertForbidden();
    }

    public function test_post_cutoff_cash_movements_are_kept_apart_in_the_cash_ledger(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $closing = $box->closing;
        $this->receiveBox($branch, $head, $box);
        $this->travelTo($closing->coverage_until);
        $this->payment($branch, $collector, '30');
        $nextBox = CashBox::query()->where('status', 'open')->whereHas('payments')->sole();
        $this->receiveBox($branch, $head, $nextBox);

        $ledger = app(BranchClosingWorkflow::class)->cashLedger($closing);
        $this->assertSame('100.00', $ledger['remaining']['ILS']);
        $this->assertSame('30.00', $ledger['afterCutoff']['ILS']);
        $this->assertSame('130.00', $ledger['actualNow']['ILS']);
    }

    public function test_open_box_tracks_existing_payment_edits_and_releases_deleted_payments(): void
    {
        [$branch, $head, $collector] = $this->start();
        $payment = $this->payment($branch, $collector);
        $entry = CashBoxPayment::query()->sole();

        $payment->update(['amount' => '-75.00', 'currency_amount' => '75.00']);

        $this->assertSame('75.00', $entry->fresh()->amount);
        $this->assertSame('75.00', app(BranchClosingWorkflow::class)->expected($entry->box)['ILS']);
        $payment->delete();
        $this->assertDatabaseMissing('cash_box_payments', ['id' => $entry->id]);
        $this->assertSame('0.00', app(BranchClosingWorkflow::class)->expected($entry->box)['ILS']);
    }

    public function test_closed_session_preserves_payment_history_and_existing_refund_action(): void
    {
        [$branch, $head, $collector] = $this->start();
        $payment = $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $this->receiveBox($branch, $head, $box);
        $actor = User::factory()->superAdmin()->create();
        SubscriptionTransaction::factory()->for($payment->subscription)->create(['amount' => '25']);

        $actions = $payment->fresh()->availableActions($actor);
        $this->assertNotContains('delete', $actions);
        $this->assertNotContains('edit_metadata', $actions);
        $this->assertContains('refund', $actions);
        $payment->applyAction($actor, TransactionAction::Refund, []);

        $this->assertSame('100.00', $box->fresh()->head_counts['ILS']);
        $this->assertSame('100.00', app(BranchClosingWorkflow::class)->balance($branch->id)['ILS']);
        $this->assertDatabaseHas('subscription_transactions', ['reference_transaction_id' => $payment->id, 'type' => 'refund']);
    }

    public function test_offline_mobile_payment_uses_original_time_without_changing_ledger_date_or_retry(): void
    {
        [$branch, $head, $collector] = $this->start();
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);
        $originalTime = $closing->coverage_until->subMinute();
        $this->travelTo($closing->coverage_until->addMinute());
        $subscription = Subscription::factory()->for($branch)->create();
        SubscriptionTransaction::factory()->for($subscription)->create(['amount' => '200']);
        $this->withToken(MobileAccessToken::issue($collector));
        $data = ['mobile_operation_id' => (string) Str::uuid(), 'collector_confirmed' => true, 'subscription_id' => $subscription->id, 'amount' => '100', 'currency' => 'ILS', 'payment_method' => 'cash', 'collected_at' => $originalTime->toIso8601String()];

        $response = $this->postJson(route('mobile.collections.store'), $data)->assertCreated();
        $entry = CashBoxPayment::query()->sole();
        $this->assertSame($closing->id, $entry->box->closing_id);
        $this->assertSame('pending', $entry->box->status);
        $this->assertTrue($entry->occurred_at->equalTo($originalTime));
        $this->assertTrue($entry->transaction->created_at->equalTo(now()));
        $this->postJson(route('mobile.collections.store'), [...$data, 'collected_at' => now()->toIso8601String()])->assertCreated()->assertJsonPath('id', $response->json('id'));
        $this->assertDatabaseCount('cash_box_payments', 1);
        $this->assertTrue($entry->fresh()->occurred_at->equalTo($originalTime));
    }

    public function test_audit_shortage_requires_decision_and_creates_debt_once_without_changing_snapshot(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $this->receiveBox($branch, $head, $box);
        $closing = $box->closing;
        $this->travelTo($closing->coverage_until);
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();
        $snapshot = $closing->fresh()->submitted_snapshot;
        $note = AuditNote::factory()->create(['closing_id' => $closing->id, 'cash_box_id' => $box->id, 'differences' => ['USD' => '-10.00']]);

        $this->action($head, $branch, 'reply', $note->id, ['kind' => 'clarification', 'body' => 'فرق من التدقيق'])->assertSessionHasErrors('action');
        $this->action($head, $branch, 'reply', $note->id, ['kind' => 'clarification', 'body' => 'رفض سبب العجز', 'decisions' => ['USD' => 'debt']])->assertSessionHasNoErrors();
        $debt = CollectorDebt::query()->sole();
        $this->assertSame('10.00', $debt->remaining);
        $this->assertSame($collector->id, $debt->user_id);
        $note->update(['status' => 'rejected']);
        $this->action($head, $branch, 'reply', $note->id, ['kind' => 'adjustment', 'body' => 'قيد التصحيح', 'book' => 'cash', 'currency' => 'USD', 'amount' => '-10', 'decisions' => ['USD' => 'debt']])->assertSessionHasNoErrors();
        $this->assertSame('10.00', $debt->fresh()->remaining);
        $this->assertSame($snapshot, $closing->fresh()->submitted_snapshot);
    }

    public function test_mobile_sync_checkpoint_is_own_only_and_unsynced_warning_is_nonblocking(): void
    {
        [$branch, $head, $collector] = $this->start();
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);
        $this->travelTo($closing->coverage_until);
        $this->artisan('closings:process')->assertSuccessful();
        $this->assertSame([$collector->id], array_column(app(BranchClosingWorkflow::class)->reviewSummary($closing)['unsyncedCollectors'], 'id'));
        $token = MobileAccessToken::issue($collector);
        $this->withToken($token)->postJson(route('mobile.cash-boxes.sync'), ['pending_payments' => 0, 'user_id' => $head->id])->assertOk();
        $this->assertDatabaseHas('cash_box_syncs', ['user_id' => $collector->id, 'branch_id' => $branch->id, 'pending_payments' => 0]);
        $this->assertSame([], app(BranchClosingWorkflow::class)->reviewSummary($closing)['unsyncedCollectors']);
        $this->withToken($token)->postJson(route('mobile.cash-boxes.sync'), ['pending_payments' => 2])->assertOk();
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();
        $this->assertSame([$collector->id], array_column($closing->fresh()->submitted_snapshot['unsyncedCollectors'], 'id'));
    }
}
