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
use App\Models\ClosingVersion;
use App\Models\CollectorDebt;
use App\Models\MobileAccessToken;
use App\Models\SafeCount;
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

    private function action(User $actor, Branch $branch, string $action, int $record, array $data = []): TestResponse
    {
        return $this->actingAs($actor)->post(route('closings.actions', ['action' => $action, 'record' => $record]), ['branch_id' => $branch->id, ...$data]);
    }

    private function counts(string $ils = '100', string $usd = '0', string $jod = '0'): array
    {
        return ['ILS' => $ils, 'USD' => $usd, 'JOD' => $jod];
    }

    private function receiveBox(Branch $branch, User $head, User $collector, CashBox $box, string $amount = '100'): void
    {
        $this->action($collector, $branch, 'close', $box->id, ['counts' => $this->counts($amount)])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'head-count', $box->id, ['counts' => $this->counts($amount)])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'receive', $box->id, ['recounted' => true, 'decisions' => []])->assertSessionHasNoErrors();
        $this->action($collector, $branch, 'confirm', $box->id)->assertSessionHasNoErrors();
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

    public function test_new_payments_share_one_session_and_manual_close_opens_another(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector, '100');
        $this->payment($branch, $collector, '10', 'USD');
        $box = CashBox::query()->sole();

        $this->action($collector, $branch, 'close', $box->id, ['counts' => $this->counts('100', '10')])->assertSessionHasNoErrors();
        $this->payment($branch, $collector, '5', 'JOD');

        $this->assertSame('pending', $box->fresh()->status);
        $this->assertSame(1, CashBox::query()->where('user_id', $collector->id)->where('status', 'open')->count());
        $this->assertSame(['ILS' => '100.00', 'USD' => '10.00', 'JOD' => '0.00'], $box->fresh()->expected_counts);
        $this->assertSame(2, $box->payments()->count());
    }

    public function test_empty_boxes_and_self_receipt_are_rejected(): void
    {
        [$branch, $head] = $this->start();
        $this->payment($branch, $head);
        $box = CashBox::query()->sole();
        $this->action($head, $branch, 'close', $box->id, ['counts' => $this->counts()])->assertSessionHasNoErrors();
        $empty = CashBox::query()->where('status', 'open')->sole();

        $this->action($head, $branch, 'close', $empty->id, ['counts' => $this->counts('0')])->assertSessionHasErrors('action');
        $this->action($head, $branch, 'head-count', $box->id, ['counts' => $this->counts()])->assertSessionHasErrors('action');

        $this->assertSame('pending', $box->fresh()->status);
        $this->assertNull($box->fresh()->head_counts);
    }

    public function test_cross_branch_requests_cannot_change_sessions(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $outsider = User::factory()->branchAdmin()->create();

        $this->action($outsider, $branch, 'head-count', $box->id, ['counts' => $this->counts()])->assertNotFound();
        $this->action($outsider, $outsider->branch, 'head-count', $box->id, ['counts' => $this->counts()])->assertNotFound();

        $this->assertNull($box->fresh()->head_counts);
    }

    public function test_blind_head_count_hides_expected_and_collector_count_until_saved(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $this->action($collector, $branch, 'close', $box->id, ['counts' => $this->counts()])->assertSessionHasNoErrors();

        $this->actingAs($head)->get(route('closings.index'))->assertInertia(fn (AssertableInertia $page) => $page->where('boxes.1.expected_counts', null)->where('boxes.1.collector_counts', null)->where('boxes.1.payments.0.amount', null));
        $this->action($head, $branch, 'head-count', $box->id, ['counts' => $this->counts()])->assertSessionHasNoErrors();

        $this->actingAs($head)->get(route('closings.index'))->assertInertia(fn (AssertableInertia $page) => $page->where('boxes.1.expected_counts.ILS', '100.00')->where('boxes.1.collector_counts.ILS', '100')->where('boxes.1.payments.0.amount', '100.00'));
    }

    public function test_rejected_shortage_becomes_debt_and_only_actual_cash_enters_safe(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $this->action($collector, $branch, 'close', $box->id, ['counts' => $this->counts()]);
        $this->action($head, $branch, 'head-count', $box->id, ['counts' => $this->counts('90')]);

        $this->action($head, $branch, 'receive', $box->id, ['recounted' => false, 'reason' => 'عجز', 'decisions' => ['ILS' => 'debt']])->assertSessionHasErrors('action');
        $this->action($head, $branch, 'receive', $box->id, ['recounted' => true, 'reason' => 'عجز', 'decisions' => ['ILS' => 'debt']])->assertSessionHasNoErrors();

        $debt = CollectorDebt::query()->sole();
        $this->assertSame('10.00', $debt->remaining);
        $this->assertSame('90.00', app(BranchClosingWorkflow::class)->balance($branch->id)['ILS']);
        $this->action($head, $branch, 'repay', $debt->id, ['amount' => '5'])->assertSessionHasNoErrors();
        $this->assertSame('5.00', $debt->fresh()->remaining);
        $this->assertSame('95.00', app(BranchClosingWorkflow::class)->balance($branch->id)['ILS']);
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

    public function test_safe_count_blocks_submission_then_snapshot_remains_frozen(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $closing = $box->closing;
        $this->receiveBox($branch, $head, $collector, $box);
        $this->travelTo($closing->coverage_until);

        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasErrors('action');
        $this->action($head, $branch, 'safe-count', $closing->id, ['counts' => $this->counts()])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();
        $snapshot = $closing->fresh()->submitted_snapshot;
        $this->payment($branch, $collector, '9');

        $this->assertSame($snapshot, $closing->fresh()->submitted_snapshot);
        $this->assertSame('submitted', $closing->fresh()->status->value);
        $this->assertDatabaseCount('closing_versions', 1);
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasErrors('action');
    }

    public function test_withdrawal_preserves_versions_and_is_forbidden_after_audit_opens(): void
    {
        [$branch, $head] = $this->start();
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);
        $this->travelTo($closing->coverage_until);
        $this->action($head, $branch, 'safe-count', $closing->id, ['counts' => $this->counts('0')]);
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true]);

        $this->action($head, $branch, 'withdraw', $closing->id)->assertSessionHasNoErrors();
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();

        $this->assertDatabaseCount('closing_versions', 2);
        $this->assertNotNull(ClosingVersion::query()->where('version', 1)->sole()->withdrawn_at);
        $closing->refresh()->update(['reviewed_at' => now()]);
        $this->action($head, $branch, 'withdraw', $closing->id)->assertSessionHasErrors('action');
        $this->assertSame('submitted', $closing->fresh()->status->value);
    }

    public function test_early_closing_creates_contiguous_remainder_to_original_cutoff(): void
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
        $this->assertTrue($next->coverage_until->equalTo($originalEnd));
        $this->assertSame('pending', CashBox::query()->sole()->status);
    }

    public function test_settings_apply_next_period_and_grants_apply_now(): void
    {
        [$branch, $head, $collector] = $this->start();
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);
        $originalEnd = $closing->coverage_until;
        $nextSettings = ['frequency' => 'weekly', 'arrangement' => 'separate', 'week_starts_on' => 2, 'cutoff_time' => '18:00'];

        $this->action($head, $branch, 'settings', 0, ['settings' => $nextSettings, 'receivers' => [$collector->id], 'approvers' => []])->assertSessionHasNoErrors();

        $this->assertTrue($closing->fresh()->coverage_until->equalTo($originalEnd));
        $this->assertSame('combined', ClosingSetting::ownFor($branch)->arrangement);
        $this->assertSame([$collector->id], ClosingSetting::ownFor($branch)->receivers);
        $this->travelTo($originalEnd);
        $this->artisan('closings:process')->assertSuccessful();
        $next = app(BranchClosingWorkflow::class)->current($branch->id);
        $this->assertTrue($next->coverage_from->equalTo($originalEnd));
        $this->assertSame('cash', $next->book);
        $this->assertSame(2, Closing::query()->where('coverage_from', $originalEnd)->count());
        $this->assertSame('separate', ClosingSetting::ownFor($branch)->arrangement);
    }

    public function test_late_payment_after_submission_enters_open_week(): void
    {
        [$branch, $head, $collector] = $this->start();
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);
        $occurred = now()->addHour();
        $this->travelTo($closing->coverage_until);
        $this->action($head, $branch, 'safe-count', $closing->id, ['counts' => $this->counts('0')]);
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
        $this->action($head, $branch, 'safe-count', $closing->id, ['counts' => $this->counts('0')]);
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true]);
        $note = AuditNote::factory()->create(['closing_id' => $closing->id]);
        $snapshot = $closing->fresh()->submitted_snapshot;

        $this->action($head, $branch, 'reply', $note->id, ['kind' => 'adjustment', 'body' => 'تصحيح فرق سابق', 'book' => 'cash', 'currency' => 'USD', 'amount' => '10'])->assertSessionHasNoErrors();

        $this->assertDatabaseHas('closing_adjustments', ['original_closing_id' => $closing->id, 'currency' => 'USD', 'amount' => '10']);
        $this->assertSame('awaiting_audit', $note->fresh()->status);
        $this->assertSame($snapshot, $closing->fresh()->submitted_snapshot);
    }

    public function test_collector_confirmation_is_required_after_receipt(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $closing = $box->closing;
        $this->action($collector, $branch, 'close', $box->id, ['counts' => $this->counts()]);
        $this->action($head, $branch, 'head-count', $box->id, ['counts' => $this->counts()]);
        $this->action($head, $branch, 'receive', $box->id, ['recounted' => false, 'decisions' => []]);
        $this->travelTo($closing->coverage_until);
        $this->action($head, $branch, 'safe-count', $closing->id, ['counts' => $this->counts()]);

        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasErrors('action');

        $this->assertNull($closing->fresh()->submitted_at);
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
        $this->action($collector, $branch, 'close', $box->id, ['reviewed' => true])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'electronic', $entry->id, ['status' => 'missing'])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'receive', $box->id)->assertSessionHasNoErrors();
        $this->travelTo($closing->coverage_until);
        $this->action($head, $branch, 'safe-count', $closing->id, ['counts' => $this->counts('0')]);
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();
        $snapshot = $closing->fresh()->submitted_snapshot;

        $this->action($head, $branch, 'electronic', $entry->id, ['status' => 'confirmed'])->assertSessionHasNoErrors();

        $this->assertSame(app(BranchClosingWorkflow::class)->current($branch->id)->id, $entry->fresh()->confirmed_in_closing_id);
        $this->assertSame($snapshot, $closing->fresh()->submitted_snapshot);
        $this->assertSame('0.00', app(BranchClosingWorkflow::class)->balance($branch->id)['ILS']);
    }

    public function test_direct_payment_box_can_only_close_at_cutoff_and_needs_no_cash_count(): void
    {
        [$branch, $head] = $this->start();
        $this->payment($branch, $head, method: 'bank_transfer');
        $entry = CashBoxPayment::query()->sole();
        $this->action($head, $branch, 'direct', $entry->id)->assertSessionHasNoErrors();
        $box = $entry->fresh()->box;
        $closing = $box->closing;

        $this->action($head, $branch, 'close', $box->id, ['reviewed' => true])->assertSessionHasErrors('action');
        $this->travelTo($closing->coverage_until);
        $this->artisan('closings:process')->assertSuccessful();
        $this->action($head, $branch, 'electronic', $entry->id, ['status' => 'confirmed'])->assertSessionHasNoErrors();

        $this->assertSame('received', $box->fresh()->status);
        $this->assertNotNull($box->fresh()->confirmed_at);
    }

    public function test_transfer_requires_proof_and_confirmation_does_not_move_cash_twice(): void
    {
        Storage::fake('local');
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $this->receiveBox($branch, $head, $collector, $box);
        $recipient = User::factory()->accountant()->create();
        $data = ['currency' => 'ILS', 'amount' => '40', 'method' => 'bank_deposit', 'recipient_id' => $recipient->id];

        $this->action($head, $branch, 'transfer', 0, $data)->assertSessionHasErrors('proof');
        $proof = UploadedFile::fake()->image('deposit.jpg');
        $this->action($head, $branch, 'transfer', 0, [...$data, 'proof' => $proof])->assertSessionHasNoErrors();

        $transfer = CashTransfer::query()->sole();
        Storage::disk('local')->assertExists($transfer->proof_path);
        $this->assertSame('60.00', app(BranchClosingWorkflow::class)->balance($branch->id)['ILS']);
        $this->actingAs($recipient)->post(route('closings.transfer-receipts', $transfer))->assertSessionHasNoErrors();
        $this->assertSame('received', $transfer->fresh()->status->value);
        $this->assertSame('60.00', app(BranchClosingWorkflow::class)->balance($branch->id)['ILS']);
    }

    public function test_mobile_session_only_lists_own_boxes(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $this->receiveBox($branch, $head, $collector, $box);
        $this->payment($branch, $head);
        $token = MobileAccessToken::issue($collector);

        $this->withToken($token)->getJson(route('mobile.cash-boxes.index'))->assertOk()->assertJsonCount(2, 'boxes')->assertJsonPath('boxes.0.user_id', $collector->id);
        $this->withToken($token)->postJson(route('mobile.cash-boxes.actions', ['action' => 'head-count', 'record' => $box->id]), ['branch_id' => $branch->id, 'counts' => $this->counts()])->assertForbidden();
    }

    public function test_post_cutoff_cash_movements_are_included_in_vault_count(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $closing = $box->closing;
        $this->receiveBox($branch, $head, $collector, $box);
        $this->travelTo($closing->coverage_until);
        $this->payment($branch, $collector, '30');
        $nextBox = CashBox::query()->where('status', 'open')->whereHas('payments')->sole();
        $this->receiveBox($branch, $head, $collector, $nextBox, '30');

        $this->action($head, $branch, 'safe-count', $closing->id, ['counts' => $this->counts('130')])->assertSessionHasNoErrors();

        $this->assertSame('130.00', SafeCount::query()->sole()->expected['ILS']);
        $this->assertSame('0.00', SafeCount::query()->sole()->differences['ILS']);
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
        $this->receiveBox($branch, $head, $collector, $box);
        $actor = User::factory()->superAdmin()->create();
        SubscriptionTransaction::factory()->for($payment->subscription)->create(['amount' => '25']);

        $actions = $payment->fresh()->availableActions($actor);
        $this->assertNotContains('delete', $actions);
        $this->assertNotContains('edit_metadata', $actions);
        $this->assertContains('refund', $actions);
        $payment->applyAction($actor, TransactionAction::Refund, []);

        $this->assertSame('100', $box->fresh()->head_counts['ILS']);
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

    public function test_direct_box_with_unconfirmed_electronic_payments_does_not_block_cash_submission(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $head, '20', 'ILS', 'bank_transfer');
        $entry = CashBoxPayment::query()->sole();
        $this->action($head, $branch, 'direct', $entry->id)->assertSessionHasNoErrors();
        $closing = $entry->fresh()->box->closing;
        $this->travelTo($closing->coverage_until);
        $this->artisan('closings:process')->assertSuccessful();
        $this->action($head, $branch, 'safe-count', $closing->id, ['counts' => $this->counts('0')])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();

        $this->assertSame('submitted', $closing->fresh()->status->value);
        $this->assertSame('pending', $entry->fresh()->status);
        $this->assertSame(1, app(BranchClosingWorkflow::class)->reviewSummary($closing->fresh())['pendingElectronic']);
    }

    public function test_audit_shortage_requires_decision_and_creates_debt_once_without_changing_snapshot(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $this->receiveBox($branch, $head, $collector, $box);
        $closing = $box->closing;
        $this->travelTo($closing->coverage_until);
        $this->action($head, $branch, 'safe-count', $closing->id, ['counts' => $this->counts()])->assertSessionHasNoErrors();
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
        $this->action($head, $branch, 'safe-count', $closing->id, ['counts' => $this->counts('0')])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();
        $this->assertSame([$collector->id], array_column($closing->fresh()->submitted_snapshot['unsyncedCollectors'], 'id'));
    }
}
