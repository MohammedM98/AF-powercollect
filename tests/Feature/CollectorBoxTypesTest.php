<?php

namespace Tests\Feature;

use App\Enums\CashBoxType;
use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\CashBox;
use App\Models\CashBoxPayment;
use App\Models\Closing;
use App\Models\MobileAccessToken;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Notifications\BranchClosingNotification;
use App\Support\BranchClosingWorkflow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class CollectorBoxTypesTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{Branch, User, User} */
    private function start(): array
    {
        $this->travelTo(now()->setDate(2026, 10, 11)->setTime(10, 0));
        $branch = Branch::factory()->create();
        $head = User::factory()->branchAdmin()->for($branch)->create();
        $collector = User::factory()->collector()->for($branch)->create();
        app(BranchClosingWorkflow::class)->start($branch->id, $head);

        return [$branch, $head, $collector];
    }

    private function entry(Branch $branch, User $collector, CashBoxType $type, string $amount = '100', ?Subscription $subscription = null): CashBoxPayment
    {
        $subscription ??= Subscription::factory()->for($branch)->create();
        $transaction = $type === CashBoxType::Clearing
            ? SubscriptionTransaction::recordClearing($subscription, $collector, $amount, 'صيانة مولد')
            : SubscriptionTransaction::recordPayment($subscription, $collector, ['amount' => $amount, 'currency' => 'ILS', 'payment_method' => $type->value, 'bank_name' => 'بنك فلسطين', 'reference_number' => 'TRX-'.Str::ulid()]);

        return CashBoxPayment::query()->where('subscription_transaction_id', $transaction->id)->sole();
    }

    /** @param array<string, mixed> $data */
    private function action(User $actor, Branch $branch, string $action, int $record, array $data = []): TestResponse
    {
        return $this->actingAs($actor)->post(route('closings.actions', ['action' => $action, 'record' => $record]), ['branch_id' => $branch->id, ...$data]);
    }

    /** @return array<string, string> */
    private function counts(string $ils = '100'): array
    {
        return ['ILS' => $ils, 'USD' => '0', 'JOD' => '0'];
    }

    public function test_cash_transfer_and_clearing_go_into_separate_boxes(): void
    {
        [$branch, $head, $collector] = $this->start();
        $cash = $this->entry($branch, $collector, CashBoxType::Cash);
        $transfer = $this->entry($branch, $collector, CashBoxType::BankTransfer);
        $clearing = $this->entry($branch, $collector, CashBoxType::Clearing);

        $this->assertDatabaseCount('cash_boxes', 3);
        foreach ([$cash, $transfer, $clearing] as $entry) {
            $this->assertDatabaseHas('cash_boxes', ['id' => $entry->cash_box_id, 'user_id' => $collector->id, 'type' => $entry->method, 'open_key' => $branch->id.':'.$collector->id.':'.$entry->method, 'status' => 'open']);
        }
        $this->assertSame('pending', $clearing->status);
        $this->assertSame('100.00', $clearing->box->totals()['ILS']);
    }

    public function test_closing_one_box_leaves_the_other_types_open(): void
    {
        [$branch, $head, $collector] = $this->start();
        $cash = $this->entry($branch, $collector, CashBoxType::Cash);
        $transfer = $this->entry($branch, $collector, CashBoxType::BankTransfer);
        $clearing = $this->entry($branch, $collector, CashBoxType::Clearing);

        $this->action($head, $branch, 'receive', $cash->cash_box_id)->assertSessionHasNoErrors();
        $next = $this->entry($branch, $collector, CashBoxType::Cash, '25');

        $this->assertSame('completed', $cash->box->fresh()->stage());
        $this->assertSame('open', $transfer->box->fresh()->status);
        $this->assertSame('open', $clearing->box->fresh()->status);
        $this->assertNotSame($cash->cash_box_id, $next->cash_box_id);
        $this->assertSame(3, CashBox::query()->where('status', 'open')->count());
    }

    public function test_collectors_cannot_close_their_own_boxes(): void
    {
        [$branch, $head, $collector] = $this->start();
        $cash = $this->entry($branch, $collector, CashBoxType::Cash);
        $transfer = $this->entry($branch, $collector, CashBoxType::BankTransfer);

        $this->action($collector, $branch, 'close', $cash->cash_box_id, ['counts' => $this->counts()])->assertForbidden();
        $this->action($collector, $branch, 'collector-count', $transfer->cash_box_id)->assertForbidden();
        $this->action($collector, $branch, 'receive', $cash->cash_box_id)->assertForbidden();
        $this->action($collector, $branch, 'receive', $transfer->cash_box_id)->assertForbidden();

        $this->assertSame(2, CashBox::query()->where('status', 'open')->count());
    }

    public function test_branch_confirms_a_non_cash_box_closed_in_one_step_confirming_its_unmarked_entries(): void
    {
        [$branch, $head, $collector] = $this->start();
        $entry = $this->entry($branch, $collector, CashBoxType::BankTransfer);

        $this->action($head, $branch, 'receive', $entry->cash_box_id)->assertSessionHasNoErrors();

        $this->assertDatabaseHas('cash_boxes', ['id' => $entry->cash_box_id, 'status' => 'received', 'close_reason' => 'manual', 'received_by' => $head->id, 'collector_counts' => null, 'head_counts' => null]);
        $this->assertDatabaseHas('cash_box_payments', ['id' => $entry->id, 'status' => 'confirmed', 'confirmed_by' => $head->id]);
    }

    public function test_branch_returns_an_entry_to_its_collector_and_confirms_the_box_once_they_answer(): void
    {
        [$branch, $head, $collector] = $this->start();
        $entry = $this->entry($branch, $collector, CashBoxType::Cash);

        $this->action($collector, $branch, 'return-entry', $entry->id, ['note' => 'رقم السند غير واضح'])->assertForbidden();
        $this->action($head, $branch, 'return-entry', $entry->id)->assertSessionHasErrors('note');
        $this->action($head, $branch, 'return-entry', $entry->id, ['note' => 'رقم السند غير واضح'])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'receive', $entry->cash_box_id)->assertSessionHasErrors('action');
        $this->assertDatabaseHas('cash_boxes', ['id' => $entry->cash_box_id, 'status' => 'open']);

        $this->actingAs($collector)->post(route('payments.cash-box-entries.reply', $entry), ['body' => 'السند رقم 15'])->assertSessionHasNoErrors();
        $this->actingAs($collector)->post(route('payments.cash-box-entries.reply', $entry), ['body' => 'مرة أخرى'])->assertNotFound();
        $this->action($head, $branch, 'receive', $entry->cash_box_id)->assertSessionHasNoErrors();

        $this->assertDatabaseHas('cash_box_payments', ['id' => $entry->id, 'return_note' => 'رقم السند غير واضح', 'returned_by' => $head->id, 'collector_reply' => 'السند رقم 15']);
        $this->assertSame('received', $entry->box->fresh()->status);
        $this->action($head, $branch, 'return-entry', $entry->id, ['note' => 'بعد الإغلاق'])->assertSessionHasErrors('action');
    }

    public function test_a_returned_entry_the_collector_cancels_no_longer_holds_the_box(): void
    {
        [$branch, $head, $collector] = $this->start();
        $entry = $this->entry($branch, $collector, CashBoxType::Cash);
        $this->action($head, $branch, 'return-entry', $entry->id, ['note' => 'دفعة مكررة'])->assertSessionHasNoErrors();

        $entry->transaction->forceFill(['status' => SubscriptionTransaction::STATUS_CANCELLED, 'cancelled_at' => now()])->save();

        $this->action($head, $branch, 'receive', $entry->cash_box_id)->assertSessionHasNoErrors();
    }

    public function test_auto_closed_boxes_go_straight_to_the_branch(): void
    {
        [$branch, $head, $collector] = $this->start();
        $cash = $this->entry($branch, $collector, CashBoxType::Cash);
        $transfer = $this->entry($branch, $collector, CashBoxType::BankTransfer);
        $this->travelTo($cash->box->closing->coverage_until);
        $this->artisan('closings:process')->assertSuccessful();

        $this->assertSame('awaiting_branch', $transfer->box->fresh()->stage());
        $this->action($collector, $branch, 'collector-count', $cash->cash_box_id, ['counts' => $this->counts()])->assertForbidden();
        $this->action($head, $branch, 'receive', $cash->cash_box_id)->assertSessionHasNoErrors();
        $this->action($head, $branch, 'electronic', $transfer->id, ['status' => 'confirmed'])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'receive', $transfer->cash_box_id)->assertSessionHasNoErrors();

        $this->assertSame('completed', $cash->box->fresh()->stage());
        $this->assertSame('completed', $transfer->box->fresh()->stage());
    }

    public function test_rejected_entries_stay_rejected_when_the_branch_confirms_the_box(): void
    {
        [$branch, $head, $collector] = $this->start();
        $accepted = $this->entry($branch, $collector, CashBoxType::Clearing);
        $rejected = $this->entry($branch, $collector, CashBoxType::Clearing, '25');

        $this->action($head, $branch, 'electronic', $rejected->id, ['status' => 'rejected'])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'receive', $accepted->cash_box_id)->assertSessionHasNoErrors();

        $this->assertDatabaseHas('cash_boxes', ['id' => $accepted->cash_box_id, 'status' => 'received', 'confirmed_at' => now(), 'received_by' => $head->id, 'head_counts' => null]);
        $this->assertSame('rejected', $rejected->fresh()->status);
        $summary = app(BranchClosingWorkflow::class)->reviewSummary($accepted->box->closing);
        $this->assertSame('100.00', $summary['clearing']['ILS']);
        $this->assertSame(1, $summary['rejectedClearings']);
        $this->assertSame('0.00', $summary['bank']['ILS']);
    }

    public function test_rejected_clearing_notifies_branch_admin_not_collector(): void
    {
        [$branch, $head, $collector] = $this->start();
        $entry = $this->entry($branch, $collector, CashBoxType::Clearing);
        Notification::fake([BranchClosingNotification::class]);

        $this->action($head, $branch, 'electronic', $entry->id, ['status' => 'rejected'])->assertSessionHasNoErrors();

        Notification::assertSentTo($head, BranchClosingNotification::class, fn (BranchClosingNotification $notification): bool => $notification->details['entry_id'] === $entry->id);
        Notification::assertNotSentTo($collector, BranchClosingNotification::class);
        $this->assertDatabaseHas('cash_box_payments', ['id' => $entry->id, 'status' => 'rejected']);
    }

    public function test_branch_admin_can_review_and_receive_entries_in_own_box(): void
    {
        [$branch, $head] = $this->start();
        $entry = $this->entry($branch, $head, CashBoxType::Clearing);

        $this->action($head, $branch, 'electronic', $entry->id, ['status' => 'confirmed'])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'receive', $entry->cash_box_id)->assertSessionHasNoErrors();

        $this->assertDatabaseHas('cash_box_payments', ['id' => $entry->id, 'status' => 'confirmed', 'confirmed_by' => $head->id]);
    }

    public function test_editing_cash_payment_to_transfer_moves_it_to_transfer_box(): void
    {
        [$branch, $head, $collector] = $this->start();
        $entry = $this->entry($branch, $collector, CashBoxType::Cash);
        $occurred = $entry->occurred_at;

        $entry->transaction->update(['payment_method' => 'bank_transfer', 'bank_name' => 'بنك فلسطين', 'reference_number' => 'EDIT-1']);

        $moved = CashBoxPayment::query()->sole();
        $this->assertSame(CashBoxType::BankTransfer, $moved->box->type);
        $this->assertNotSame($entry->cash_box_id, $moved->cash_box_id);
        $this->assertTrue($occurred->equalTo($moved->occurred_at));
        $this->assertSame('0.00', $entry->box->fresh()->totals()['ILS']);
        $moved->transaction->update(['payment_method' => 'cash']);
        $this->assertSame($entry->cash_box_id, CashBoxPayment::query()->sole()->cash_box_id);
    }

    public function test_safe_balance_counts_only_cash_boxes(): void
    {
        [$branch, $head, $collector] = $this->start();
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);
        foreach ([CashBoxType::Cash, CashBoxType::BankTransfer, CashBoxType::Clearing] as $type) {
            CashBox::factory()->create(['branch_id' => $branch->id, 'closing_id' => $closing->id, 'user_id' => $collector->id, 'type' => $type, 'status' => 'received', 'head_counts' => $this->counts(), 'confirmed_at' => now()]);
        }

        $this->assertSame('100.00', app(BranchClosingWorkflow::class)->balance($branch->id)['ILS']);
        $this->assertSame('100.00', app(BranchClosingWorkflow::class)->cashLedger($closing)['received']['ILS']);
    }

    public function test_collector_sees_own_box_transactions_only(): void
    {
        [$branch, $head, $collector] = $this->start();
        $entry = $this->entry($branch, $collector, CashBoxType::BankTransfer);
        $other = $this->entry($branch, $head, CashBoxType::Cash);
        $direct = CashBox::factory()->bankTransfer()->create(['branch_id' => $branch->id, 'user_id' => $collector->id, 'kind' => 'direct']);

        $this->actingAs($collector)->get(route('payments.cash-boxes.show', $entry->cash_box_id))->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Payments/CashBoxShow')->where('box.type', 'bank_transfer')->where('box.stage', 'open')
            ->where('box.totals.ILS', '100.00')->has('entries.data', 1)->where('entries.data.0.referenceNumber', $entry->transaction->reference_number)
            ->where('entries.data.0.accountNumber', $entry->transaction->subscription->account_number));
        $this->get(route('payments.cash-boxes.show', $other->cash_box_id))->assertNotFound();
        $this->get(route('payments.cash-boxes.show', $direct))->assertNotFound();
        $this->actingAs(User::factory()->dataEntry()->for($branch)->create())->get(route('payments.cash-boxes.show', $entry->cash_box_id))->assertForbidden();
        $this->actingAs(User::factory()->collector()->create())->get(route('payments.cash-boxes.show', $entry->cash_box_id))->assertNotFound();
    }

    public function test_user_with_record_collections_permission_gets_boxes_whatever_role(): void
    {
        [$branch] = $this->start();
        $collector = User::factory()->dataEntry()->for($branch)->withPermissions([PermissionKey::RecordCollections])->create();
        MobileAccessToken::issue($collector);
        $entry = $this->entry($branch, $collector, CashBoxType::Cash);

        $this->actingAs($collector)->get(route('payments.cash-boxes'))->assertInertia(fn (AssertableInertia $page) => $page->where('current.cash.id', $entry->cash_box_id)->where('current.bank_transfer', null)->where('current.clearing', null));
        $this->assertContains($collector->id, array_column(app(BranchClosingWorkflow::class)->snapshot($entry->box->closing)['unsyncedCollectors'], 'id'));
        $this->action($collector, $branch, 'close', $entry->cash_box_id, ['counts' => $this->counts()])->assertForbidden();
        $this->assertDatabaseHas('cash_boxes', ['id' => $entry->cash_box_id, 'status' => 'open']);
    }

    public function test_review_status_must_match_entry_type_and_clearings_cannot_be_direct(): void
    {
        [$branch, $head, $collector] = $this->start();
        $clearing = $this->entry($branch, $collector, CashBoxType::Clearing);
        $transfer = $this->entry($branch, $collector, CashBoxType::BankTransfer);
        $this->action($head, $branch, 'direct', $clearing->id)->assertSessionHasErrors('action');

        $this->action($head, $branch, 'electronic', $clearing->id, ['status' => 'missing'])->assertSessionHasErrors('action');
        $this->action($head, $branch, 'electronic', $transfer->id, ['status' => 'rejected'])->assertSessionHasErrors('action');

        $this->assertDatabaseHas('cash_box_payments', ['id' => $clearing->id, 'status' => 'pending']);
        $this->assertDatabaseHas('cash_box_payments', ['id' => $transfer->id, 'status' => 'pending']);
    }

    public function test_mobile_api_returns_box_transactions_but_cannot_close_boxes(): void
    {
        [$branch, $head, $collector] = $this->start();
        $entry = $this->entry($branch, $collector, CashBoxType::Clearing);
        $this->withToken(MobileAccessToken::issue($collector))->getJson(route('mobile.cash-boxes.index'))->assertJsonPath('boxes.0.type', 'clearing')->assertJsonPath('boxes.0.stage', 'open')->assertJsonPath('boxes.0.totals.ILS', '100.00')->assertJsonPath('boxes.0.payments.0.transaction.notes', 'صيانة مولد');

        foreach (['close', 'collector-count'] as $action) {
            $this->postJson(route('mobile.cash-boxes.actions', ['action' => $action, 'record' => $entry->cash_box_id]), ['branch_id' => $branch->id, 'reviewed' => true])->assertForbidden();
        }
        $this->assertDatabaseHas('cash_boxes', ['id' => $entry->cash_box_id, 'status' => 'open']);
    }

    public function test_legacy_separate_periods_transition_to_one_package_without_box_blockers(): void
    {
        [$branch, $head, $collector] = $this->start();
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);
        $closing->update(['book' => 'cash']);
        $bank = Closing::factory()->create(['branch_id' => $branch->id, 'coverage_from' => $closing->coverage_from, 'coverage_until' => $closing->coverage_until, 'book' => 'bank', 'workflow_settings' => $closing->workflow_settings]);
        $entry = $this->entry($branch, $collector, CashBoxType::Clearing);
        $this->travelTo($closing->coverage_until);
        app(BranchClosingWorkflow::class)->refresh($branch->id);

        $workflow = app(BranchClosingWorkflow::class);
        $this->assertNotContains('يوجد صندوق لم يُستلم أو لم يؤكّد صاحبه التسليم.', $workflow->blockers($bank));
        $this->assertNotContains('يوجد صندوق لم يُستلم أو لم يؤكّد صاحبه التسليم.', $workflow->blockers($closing));
        $this->assertCount(1, $workflow->snapshot($closing)['boxes']);
        $this->assertCount(1, $workflow->snapshot($bank)['boxes']);
        $this->assertCount(1, $workflow->snapshot($bank)['clearings']);
        $this->assertSame('combined', $workflow->current($branch->id)->book);
        $this->action($head, $branch, 'safe-count', $closing->id, ['counts' => $this->counts('0')])->assertSessionHasNoErrors();
    }

    public function test_cancelled_entries_stay_visible_but_do_not_count_or_block_receipt(): void
    {
        [$branch, $head, $collector] = $this->start();
        $cancelled = $this->entry($branch, $collector, CashBoxType::Clearing);
        $active = $this->entry($branch, $collector, CashBoxType::Clearing, '25');
        $cancelled->transaction->update(['status' => SubscriptionTransaction::STATUS_CANCELLED]);
        $this->action($head, $branch, 'electronic', $active->id, ['status' => 'confirmed'])->assertSessionHasNoErrors();

        $this->action($head, $branch, 'receive', $active->cash_box_id)->assertSessionHasNoErrors();

        $this->actingAs($collector)->get(route('payments.cash-boxes.show', $active->cash_box_id))->assertInertia(fn (AssertableInertia $page) => $page->where('box.totals.ILS', '25.00')->has('entries.data', 2)->where('entries.data.1.transactionStatus', SubscriptionTransaction::STATUS_CANCELLED));
        $this->assertSame('completed', $active->box->fresh()->stage());
    }

    public function test_collector_box_filters_keep_action_boxes_visible(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->entry($branch, $collector, CashBoxType::Cash);
        $entry = $this->entry($branch, $collector, CashBoxType::Clearing);
        $this->travelTo($entry->box->closing->coverage_until);
        app(BranchClosingWorkflow::class)->refresh($branch->id);

        $this->actingAs($collector)->get(route('payments.cash-boxes', ['type' => 'clearing', 'state' => 'closed']))->assertInertia(fn (AssertableInertia $page) => $page->where('boxes.total', 1)->where('boxes.data.0.id', $entry->cash_box_id)->has('needsAction', 0)->where('filters.type', 'clearing')->where('filters.state', 'closed'));
    }

    public function test_collector_actions_require_collection_permission(): void
    {
        [$branch] = $this->start();
        $user = User::factory()->dataEntry()->for($branch)->create();
        $entry = $this->entry($branch, $user, CashBoxType::Cash);

        $this->action($user, $branch, 'close', $entry->cash_box_id, ['counts' => $this->counts()])->assertForbidden();
        $this->withToken(MobileAccessToken::issue($user))->getJson(route('mobile.cash-boxes.index'))->assertForbidden();
        $this->assertDatabaseHas('cash_boxes', ['id' => $entry->cash_box_id, 'status' => 'open', 'collector_submitted_at' => null]);
    }

    public function test_staff_with_only_adjustment_permission_see_their_clearings_but_cannot_close_them(): void
    {
        [$branch] = $this->start();
        $user = User::factory()->dataEntry()->for($branch)->withPermissions([PermissionKey::AdjustBalances])->create();
        $entry = $this->entry($branch, $user, CashBoxType::Clearing);

        $this->actingAs($user)->get(route('payments.cash-boxes'))->assertInertia(fn (AssertableInertia $page) => $page->where('current.clearing.id', $entry->cash_box_id));
        $this->get(route('payments.cash-boxes.show', $entry->cash_box_id))->assertOk();
        $this->action($user, $branch, 'receive', $entry->cash_box_id)->assertForbidden();

        $this->assertDatabaseHas('cash_boxes', ['id' => $entry->cash_box_id, 'status' => 'open']);
    }

    public function test_refresh_attaches_historical_clearings_as_late_after_period_was_submitted(): void
    {
        [$branch, $head, $collector] = $this->start();
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);
        $occurred = now();
        $this->travelTo($closing->coverage_until);
        $this->action($head, $branch, 'safe-count', $closing->id, ['counts' => $this->counts('0')])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();
        $transaction = SubscriptionTransaction::withoutEvents(fn (): SubscriptionTransaction => SubscriptionTransaction::factory()->for(Subscription::factory()->for($branch))->create(['branch_id' => $branch->id, 'recorded_by' => $collector->id, 'type' => 'clearing', 'status' => SubscriptionTransaction::STATUS_ACTIVE, 'source_key' => 'clearing:'.Str::ulid(), 'amount' => '-20', 'notes' => 'صيانة قديمة', 'created_at' => $occurred]));

        $this->actingAs($collector)->get(route('payments.cash-boxes'))->assertInertia(fn (AssertableInertia $page) => $page->where('current.clearing.totals.ILS', '20.00'));

        $entry = CashBoxPayment::query()->where('subscription_transaction_id', $transaction->id)->sole();
        $this->assertTrue($entry->is_late);
        $this->assertNotSame($closing->id, $entry->box->closing_id);
        $this->assertSame('open', $entry->box->status);
    }

    public function test_box_transactions_are_paginated_with_full_box_totals(): void
    {
        [$branch, $head, $collector] = $this->start();
        $first = $this->entry($branch, $collector, CashBoxType::Clearing, '1');
        $subscription = $first->transaction->subscription;
        for ($index = 0; $index < 25; $index++) {
            $this->entry($branch, $collector, CashBoxType::Clearing, '1', $subscription);
        }

        $this->actingAs($collector)->get(route('payments.cash-boxes.show', ['cashBox' => $first->cash_box_id, 'page' => 2]))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('box.totals.ILS', '26.00')->where('entries.total', 26)->has('entries.data', 1)->where('entries.data.0.id', $first->id));
    }

    public function test_branch_admin_can_cancel_a_rejected_clearing_before_branch_submission(): void
    {
        [$branch, $head, $collector] = $this->start();
        $entry = $this->entry($branch, $collector, CashBoxType::Clearing);
        $this->action($head, $branch, 'electronic', $entry->id, ['status' => 'rejected'])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'receive', $entry->cash_box_id)->assertSessionHasNoErrors();

        $this->actingAs($head)->post(route('subscriptions.transactions.actions.store', [$entry->transaction->subscription, $entry->transaction]), ['action' => 'cancel', 'correction_reason' => 'other', 'correction_notes' => 'المقاصة غير مطابقة'])->assertSessionHasNoErrors();

        $this->assertDatabaseHas('subscription_transactions', ['id' => $entry->subscription_transaction_id, 'status' => SubscriptionTransaction::STATUS_CANCELLED]);
        $this->assertDatabaseHas('cash_box_payments', ['id' => $entry->id, 'status' => 'rejected']);
        $this->assertSame('0.00', $entry->box->fresh()->totals()['ILS']);
    }

    public function test_carried_rejected_clearing_can_be_cancelled_after_the_package_is_sent(): void
    {
        [$branch, $head, $collector] = $this->start();
        $entry = $this->entry($branch, $collector, CashBoxType::Clearing);
        $closing = $entry->box->closing;
        $this->action($head, $branch, 'electronic', $entry->id, ['status' => 'rejected'])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'receive', $entry->cash_box_id)->assertSessionHasNoErrors();
        $this->travelTo($closing->coverage_until);
        $this->action($head, $branch, 'safe-count', $closing->id, ['counts' => $this->counts('0')])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();

        SubscriptionTransaction::factory()->for($entry->transaction->subscription)->create(['type' => 'penalty', 'source_key' => 'after-clearing:'.$entry->id, 'amount' => '20']);
        $snapshot = $closing->fresh()->submitted_snapshot;
        $this->actingAs($head)->post(route('subscriptions.transactions.actions.store', [$entry->transaction->subscription, $entry->transaction]), ['action' => 'cancel', 'correction_reason' => 'other', 'correction_notes' => 'تصحيح'])->assertSessionHasNoErrors();

        $this->assertDatabaseHas('subscription_transactions', ['id' => $entry->subscription_transaction_id, 'status' => SubscriptionTransaction::STATUS_CANCELLED]);
        $this->assertFalse($entry->transaction->fresh()->isInClosedDay());
        $this->assertSame($snapshot, $closing->fresh()->submitted_snapshot);
    }

    public function test_branch_receives_a_departed_collectors_boxes_without_their_submission(): void
    {
        [$branch, $head, $collector] = $this->start();
        $cash = $this->entry($branch, $collector, CashBoxType::Cash);
        $transfer = $this->entry($branch, $collector, CashBoxType::BankTransfer);
        $collector->update(['is_active' => false]);
        app(BranchClosingWorkflow::class)->refresh($branch->id);

        $this->assertDatabaseHas('cash_boxes', ['id' => $cash->cash_box_id, 'status' => 'pending', 'close_reason' => 'departure', 'collector_submitted_at' => null]);
        $this->action($head, $branch, 'receive', $cash->cash_box_id)->assertSessionHasNoErrors();
        $this->action($head, $branch, 'electronic', $transfer->id, ['status' => 'confirmed'])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'receive', $transfer->cash_box_id)->assertSessionHasNoErrors();

        $this->assertNotNull($cash->box->fresh()->confirmed_at);
        $this->assertSame('received', $transfer->box->fresh()->status);
        $this->travelTo($cash->box->closing->coverage_until);
        $this->assertNotContains('يوجد صندوق لم يُستلم أو لم يؤكّد صاحبه التسليم.', app(BranchClosingWorkflow::class)->blockers($cash->box->closing));
    }

    public function test_collector_who_lost_the_permission_does_not_hold_up_their_closed_box(): void
    {
        [$branch, $head, $collector] = $this->start();
        $clearing = $this->entry($branch, $collector, CashBoxType::Clearing);
        $cash = $this->entry($branch, $collector, CashBoxType::Cash);
        $this->travelTo($cash->box->closing->coverage_until);
        $this->artisan('closings:process')->assertSuccessful();
        $collector->permissions()->detach();

        $this->action($collector, $branch, 'collector-count', $cash->cash_box_id, ['counts' => $this->counts()])->assertForbidden();
        $this->action($head, $branch, 'receive', $cash->cash_box_id)->assertSessionHasNoErrors();
        $this->action($head, $branch, 'electronic', $clearing->id, ['status' => 'confirmed'])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'receive', $clearing->cash_box_id)->assertSessionHasNoErrors();

        $this->assertNotNull($cash->box->fresh()->confirmed_at);
        $this->assertSame('completed', $clearing->box->fresh()->stage());
    }

    public function test_snapshot_keeps_the_clearing_service_and_lists_only_field_app_users_as_unsynced(): void
    {
        [$branch, $head, $collector] = $this->start();
        $counterStaff = User::factory()->dataEntry()->for($branch)->withPermissions([PermissionKey::RecordCollections])->create();
        $fieldStaff = User::factory()->dataEntry()->for($branch)->withPermissions([PermissionKey::RecordCollections])->create();
        MobileAccessToken::issue($fieldStaff);
        $clearing = $this->entry($branch, $collector, CashBoxType::Clearing);

        $snapshot = app(BranchClosingWorkflow::class)->snapshot($clearing->box->closing);

        $this->assertSame('صيانة مولد', $snapshot['clearings'][0]['transaction']['notes']);
        $this->assertEqualsCanonicalizing([$collector->id, $fieldStaff->id], array_column($snapshot['unsyncedCollectors'], 'id'));
    }
}
