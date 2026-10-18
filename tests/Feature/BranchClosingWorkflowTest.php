<?php

namespace Tests\Feature;

use App\Enums\TransactionAction;
use App\Models\Branch;
use App\Models\CashBox;
use App\Models\CashBoxPayment;
use App\Models\CashTransfer;
use App\Models\Closing;
use App\Models\ClosingSetting;
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
use Illuminate\Validation\ValidationException;
use Inertia\Testing\AssertableInertia;
use PHPUnit\Framework\Attributes\TestWith;
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
        $this->actingAs($head)->post(route('payments.cash-boxes.actions', ['action' => 'start']), ['branch_id' => $branch->id])->assertSessionHasNoErrors();

        return [$branch, $head, $collector];
    }

    private function payment(Branch $branch, User $collector, string $amount = '100', string $currency = 'ILS', string $method = 'cash', array $extra = []): SubscriptionTransaction
    {
        return SubscriptionTransaction::factory()->for(Subscription::factory()->for($branch)->create())->create(['recorded_by' => $collector->id, 'type' => 'payment', 'source_key' => 'payment:'.Str::ulid(), 'amount' => '-'.$amount, 'currency_amount' => $amount, 'currency' => $currency, 'payment_method' => $method, ...$extra]);
    }

    /** One of the branch's actions on its boxes. */
    private function action(User $actor, Branch $branch, string $action, int $record, array $data = []): TestResponse
    {
        return $this->actingAs($actor)->post(route('payments.cash-boxes.actions', ['action' => $action, 'record' => $record]), ['branch_id' => $branch->id, ...$data]);
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
        $this->get(route('payments.cash-boxes'))->assertRedirect(route('login'));
        $this->actingAs(User::factory()->dataEntry()->create())->get(route('payments.cash-boxes'))->assertForbidden();
    }

    public function test_the_weekly_package_and_its_pages_are_gone(): void
    {
        [$branch, $head] = $this->start();
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);
        $this->travelTo($closing->coverage_until);

        $this->get('/weekly-packages')->assertNotFound();
        $this->get('/reconciliation')->assertNotFound();
        foreach (['submit', 'early', 'settings', 'repay', 'reply'] as $action) {
            $this->action($head, $branch, $action, $closing->id)->assertForbidden();
        }

        $this->assertNull($closing->fresh()->submitted_at);
        $this->assertDatabaseCount('closing_versions', 0);
    }

    public function test_start_preserves_historical_closings_and_ignores_old_payments(): void
    {
        $branch = Branch::factory()->create();
        $head = User::factory()->branchAdmin()->for($branch)->create();
        $legacy = Closing::factory()->for($branch)->submitted()->create();
        SubscriptionTransaction::withoutEvents(fn () => $this->payment($branch, $head, extra: ['created_at' => now()->subWeek()]));

        $this->actingAs($head)->post(route('payments.cash-boxes.actions', ['action' => 'start']), ['branch_id' => $branch->id])->assertSessionHasNoErrors();

        $this->assertNull($legacy->fresh()->workflow_settings);
        $this->assertSame('submitted', $legacy->fresh()->status->value);
        $this->assertDatabaseCount('cash_box_payments', 0);
        $this->assertSame('weekly', ClosingSetting::ownFor($branch)->frequency);
    }

    #[TestWith(['payment', 'cash', 'cash'])]
    #[TestWith(['payment', 'bank_transfer', 'bank_transfer'])]
    #[TestWith(['clearing', null, 'clearing'])]
    public function test_first_collection_automatically_opens_its_box(string $type, ?string $method, string $boxType): void
    {
        $this->freezeTime();
        $branch = Branch::factory()->create();
        $collector = User::factory()->collector()->for($branch)->create();
        ClosingSetting::company()->update(['week_starts_on' => 2, 'cutoff_time' => '15:00']);
        $legacy = Closing::factory()->for($branch)->submitted()->create();
        SubscriptionTransaction::withoutEvents(fn () => $this->payment($branch, $collector, extra: ['created_at' => now()->subWeek()]));

        $payment = $this->payment($branch, $collector, extra: ['type' => $type, 'payment_method' => $method]);

        $box = CashBox::query()->sole();
        $this->assertDatabaseHas('cash_boxes', ['id' => $box->id, 'branch_id' => $branch->id, 'user_id' => $collector->id, 'type' => $boxType, 'status' => 'open']);
        $this->assertDatabaseHas('cash_box_payments', ['cash_box_id' => $box->id, 'subscription_transaction_id' => $payment->id, 'amount' => '100.00']);
        $this->assertDatabaseCount('cash_box_payments', 1);
        $this->assertDatabaseHas('closing_settings', ['branch_id' => $branch->id, 'week_starts_on' => 2, 'cutoff_time' => '15:00', 'updated_by' => $collector->id]);
        $this->assertNotNull(ClosingSetting::ownFor($branch)->workflow_started_at);
        $this->assertNull($legacy->fresh()->workflow_settings);
        $this->assertSame('submitted', $legacy->fresh()->status->value);
    }

    #[TestWith(['subscription_fee', 'active'])]
    #[TestWith(['payment', 'cancelled'])]
    public function test_non_collection_or_cancelled_transaction_does_not_open_boxes(string $type, string $status): void
    {
        $branch = Branch::factory()->create();
        $collector = User::factory()->collector()->for($branch)->create();

        $this->payment($branch, $collector, extra: ['type' => $type, 'status' => $status]);

        $this->assertNull(ClosingSetting::ownFor($branch)?->workflow_started_at);
        $this->assertDatabaseCount('cash_boxes', 0);
        $this->assertDatabaseCount('cash_box_payments', 0);
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

        $this->actingAs($head)->get(route('payments.cash-boxes', ['place' => 'open']))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('boxes.0.status', 'open')->where('boxes.0.payments.0.amount', '100.00'));
    }

    public function test_no_weekly_cutoff_closes_a_box_and_payments_after_it_join_the_same_open_box(): void
    {
        [$branch, , $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $closing = $box->closing;

        $this->travelTo($closing->coverage_until->addDay());
        $this->artisan('closings:process')->assertSuccessful();
        $this->payment($branch, $collector, '7');

        $this->assertSame('open', $box->fresh()->status);
        $this->assertNull($box->fresh()->closed_at);
        $this->assertSame(2, $box->payments()->count());
        $this->assertSame(1, CashBox::query()->count());
        $this->assertTrue(app(BranchClosingWorkflow::class)->current($branch->id)->coverage_from->equalTo($closing->coverage_until));
    }

    public function test_an_empty_open_box_is_removed_at_the_end_of_its_week(): void
    {
        [$branch, , $collector] = $this->start();
        $payment = $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $payment->delete();

        $this->travelTo($box->closing->coverage_until);
        $this->artisan('closings:process')->assertSuccessful();

        $this->assertDatabaseMissing('cash_boxes', ['id' => $box->id]);
    }

    public function test_a_payment_synced_after_its_week_ended_joins_the_collectors_open_box(): void
    {
        [$branch, , $collector] = $this->start();
        $this->payment($branch, $collector);
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);
        $occurred = now()->addHour();
        $this->travelTo($closing->coverage_until->addHour());

        $this->payment($branch, $collector, extra: ['created_at' => $occurred]);

        $box = CashBox::query()->sole();
        $this->assertSame('open', $box->status);
        $this->assertSame(2, $box->payments()->count());
        $this->assertFalse($box->payments()->latest('id')->first()->is_late);
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
        $this->actingAs($head)->get("/reconciliation/proofs/transfer/{$transfer->id}")->assertNotFound();

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

    public function test_closed_session_preserves_payment_history_and_refuses_refunds(): void
    {
        [$branch, $head, $collector] = $this->start();
        $payment = $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $this->receiveBox($branch, $head, $box);
        $actor = User::factory()->superAdmin()->create();
        SubscriptionTransaction::factory()->for($payment->subscription)->create(['amount' => '25']);

        $before = $payment->fresh()->getAttributes();
        $this->assertSame([], $payment->fresh()->availableActions($actor));

        try {
            $payment->applyAction($actor, TransactionAction::Refund, []);
            $this->fail('A closed-box payment must not be refunded.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('action', $exception->errors());
        }

        $this->assertSame($before, $payment->fresh()->getAttributes());
        $this->assertSame('100.00', $box->fresh()->totals()['ILS']);
        $this->assertSame('100.00', $box->fresh()->head_counts['ILS']);
        $this->assertDatabaseMissing('subscription_transactions', ['reference_transaction_id' => $payment->id, 'type' => 'refund']);
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
        // It joins the collector's open box: no week holds a box back any more.
        $this->assertSame('open', $entry->box->status);
        $this->assertTrue($entry->occurred_at->equalTo($originalTime));
        $this->assertTrue($entry->transaction->created_at->equalTo(now()));
        $this->postJson(route('mobile.collections.store'), [...$data, 'collected_at' => now()->toIso8601String()])->assertCreated()->assertJsonPath('id', $response->json('id'));
        $this->assertDatabaseCount('cash_box_payments', 1);
        $this->assertTrue($entry->fresh()->occurred_at->equalTo($originalTime));
    }

    public function test_mobile_sync_checkpoint_is_own_only(): void
    {
        [$branch, $head, $collector] = $this->start();
        $token = MobileAccessToken::issue($collector);

        $this->withToken($token)->postJson(route('mobile.cash-boxes.sync'), ['pending_payments' => 0, 'user_id' => $head->id])->assertOk();

        $this->assertDatabaseHas('cash_box_syncs', ['user_id' => $collector->id, 'branch_id' => $branch->id, 'pending_payments' => 0]);
        $this->assertDatabaseMissing('cash_box_syncs', ['user_id' => $head->id]);
    }
}
