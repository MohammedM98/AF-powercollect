<?php

namespace Tests\Feature;

use App\Enums\CashBoxType;
use App\Enums\ClosingStatus;
use App\Models\AuditNote;
use App\Models\Branch;
use App\Models\CashBox;
use App\Models\CashBoxPayment;
use App\Models\Closing;
use App\Models\ClosingSetting;
use App\Models\ClosingSettingChange;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Support\BranchClosingWorkflow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class BranchPackageTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{Branch, User, User, Closing} */
    private function start(): array
    {
        $this->travelTo(now()->setDate(2026, 10, 11)->setTime(10, 0));
        $branch = Branch::factory()->create();
        $head = User::factory()->branchAdmin()->for($branch)->create();
        $collector = User::factory()->collector()->for($branch)->create();
        $workflow = app(BranchClosingWorkflow::class);
        $workflow->start($branch->id, $head);

        return [$branch, $head, $collector, $workflow->current($branch->id)];
    }

    private function entry(Branch $branch, User $user, CashBoxType $type = CashBoxType::Cash): CashBoxPayment
    {
        $subscription = Subscription::factory()->for($branch)->create();
        $transaction = $type === CashBoxType::Clearing
            ? SubscriptionTransaction::recordClearing($subscription, $user, '100', 'صيانة مولد')
            : SubscriptionTransaction::recordPayment($subscription, $user, ['amount' => '100', 'currency' => 'ILS', 'payment_method' => $type->value, 'bank_name' => 'بنك فلسطين', 'reference_number' => 'PKG-'.Str::ulid()]);

        return CashBoxPayment::query()->where('subscription_transaction_id', $transaction->id)->sole();
    }

    /**
     * Confirming a box's close says the cash was counted, unless `$data` says otherwise.
     *
     * @param  array<string, mixed>  $data
     */
    private function action(User $actor, Branch $branch, string $action, int $record, array $data = []): TestResponse
    {
        return $this->actingAs($actor)->post(route('closings.actions', ['action' => $action, 'record' => $record]), ['branch_id' => $branch->id, ...($action === 'receive' ? ['cash_counted' => true] : []), ...$data]);
    }

    /** @return array<string, string> */
    private function counts(string $ils = '100'): array
    {
        return ['ILS' => $ils, 'USD' => '0', 'JOD' => '0'];
    }

    private function receiveCash(Branch $branch, User $head, User $collector, CashBox $box): void
    {
        $this->action($head, $branch, 'receive', $box->id)->assertSessionHasNoErrors();
    }

    public function test_a_box_closed_at_the_cutoff_is_accepted_into_its_week_when_the_week_is_sent(): void
    {
        [$branch, $head, $collector, $closing] = $this->start();
        $entry = $this->entry($branch, $collector);
        $this->travelTo($closing->coverage_until);

        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();

        $snapshot = $closing->fresh()->submitted_snapshot;
        $this->assertSame([], $snapshot['carriedOut']['boxes']);
        $this->assertSame([], $snapshot['warnings']);
        $this->assertDatabaseHas('cash_boxes', ['id' => $entry->cash_box_id, 'status' => 'received', 'received_in_closing_id' => $closing->id]);
        $this->assertDatabaseHas('closing_payments', ['subscription_transaction_id' => $entry->subscription_transaction_id, 'closing_id' => $closing->id]);
        $this->assertSame('100.00', app(BranchClosingWorkflow::class)->reviewSummary($closing->fresh())['cash']['ILS']);
        $this->assertSame('0.00', app(BranchClosingWorkflow::class)->reviewSummary($closing->fresh())['cashWithCollectors']['ILS']);
    }

    public function test_missing_and_rejected_entries_are_carried_while_a_closed_box_is_accepted_with_its_week(): void
    {
        [$branch, $head, $collector, $closing] = $this->start();
        $missing = $this->entry($branch, $collector, CashBoxType::BankTransfer);
        $rejected = $this->entry($branch, $collector, CashBoxType::Clearing);
        $pending = $this->entry($branch, User::factory()->collector()->for($branch)->create(), CashBoxType::BankTransfer);
        $this->action($head, $branch, 'electronic', $missing->id, ['status' => 'missing'])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'electronic', $rejected->id, ['status' => 'rejected'])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'receive', $missing->cash_box_id)->assertSessionHasNoErrors();
        $this->action($head, $branch, 'receive', $rejected->cash_box_id)->assertSessionHasNoErrors();
        $this->travelTo($closing->coverage_until);

        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();

        $snapshot = $closing->fresh()->submitted_snapshot;
        $this->assertEqualsCanonicalizing([$missing->id, $rejected->id], array_column($snapshot['carriedOut']['entries'], 'id'));
        $this->assertSame([], $snapshot['carriedOut']['boxes']);
        $this->assertSame(['2 حركة (حوالة أو مقاصة) غير مؤكدة أو مرفوضة وستُرحّل إلى الأسبوع القادم.'], $snapshot['warnings']);
        $this->assertSame($closing->id, $pending->fresh()->confirmed_in_closing_id);
        $this->assertDatabaseHas('closing_payments', ['subscription_transaction_id' => $pending->subscription_transaction_id, 'closing_id' => $closing->id]);
        $this->action($head, $branch, 'electronic', $missing->id, ['status' => 'confirmed'])->assertSessionHasNoErrors();
        $next = app(BranchClosingWorkflow::class)->current($branch->id);
        $this->assertSame($next->id, $missing->fresh()->confirmed_in_closing_id);
        $this->assertSame('100.00', app(BranchClosingWorkflow::class)->reviewSummary($next)['bank']['ILS']);
        $this->assertSame($snapshot, $closing->fresh()->submitted_snapshot);
    }

    public function test_a_branch_holding_cash_sends_its_week_without_counting_the_safe(): void
    {
        [$branch, $head, $collector, $closing] = $this->start();
        $entry = $this->entry($branch, $collector);
        $this->receiveCash($branch, $head, $collector, $entry->box);
        $this->travelTo($closing->coverage_until);

        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();

        $this->assertSame('submitted', $closing->fresh()->status->value);
        $this->assertSame('100.00', $closing->fresh()->submitted_snapshot['safeBalanceAtSubmission']['ILS']);
        $this->assertDatabaseCount('safe_counts', 0);
    }

    /** @return array<string, array{string, bool}> */
    public static function selfReceivers(): array
    {
        return ['admin' => ['admin', true], 'approver' => ['approver', true], 'receiver' => ['receiver', false]];
    }

    #[DataProvider('selfReceivers')]
    public function test_own_box_receipt_is_allowed_only_for_branch_admin_and_approvers(string $role, bool $allowed): void
    {
        [$branch, $head, $collector, $closing] = $this->start();
        $actor = $role === 'admin' ? $head : $collector;
        ClosingSetting::ownFor($branch)->update(['receivers' => $role === 'receiver' ? [$actor->id] : [], 'approvers' => $role === 'approver' ? [$actor->id] : []]);
        $entry = $this->entry($branch, $actor);

        $response = $this->action($actor, $branch, 'receive', $entry->cash_box_id);

        if (! $allowed) {
            $response->assertSessionHasErrors('action');
            $this->assertDatabaseHas('cash_boxes', ['id' => $entry->cash_box_id, 'head_counts' => null]);

            return;
        }
        $response->assertSessionHasNoErrors();
        $this->assertDatabaseHas('cash_boxes', ['id' => $entry->cash_box_id, 'received_in_closing_id' => $closing->id, 'confirmed_at' => now()]);
    }

    public function test_a_box_left_pending_by_a_week_sent_earlier_settles_in_the_earliest_unsent_week(): void
    {
        [$branch, $head, $collector, $closing] = $this->start();
        $entry = $this->entry($branch, $collector);
        $this->travelTo($closing->coverage_until);
        app(BranchClosingWorkflow::class)->refresh($branch->id);
        $closing->update(['status' => ClosingStatus::Submitted, 'submitted_at' => now(), 'submitted_snapshot' => app(BranchClosingWorkflow::class)->snapshot($closing)]);
        $unsent = app(BranchClosingWorkflow::class)->current($branch->id);
        $this->travelTo($unsent->coverage_until);
        app(BranchClosingWorkflow::class)->refresh($branch->id);
        $this->assertSame('pending', $entry->box->fresh()->status);

        $this->receiveCash($branch, $head, $collector, $entry->box);

        $this->assertSame($unsent->id, $entry->box->fresh()->received_in_closing_id);
        $this->assertNotSame($unsent->id, app(BranchClosingWorkflow::class)->current($branch->id)->id);
    }

    public function test_settings_reject_daily_and_separate_and_normalize_future_periods(): void
    {
        [$branch, $head, $collector, $closing] = $this->start();
        $settings = ['week_starts_on' => 6, 'cutoff_time' => '00:00'];
        $this->action($head, $branch, 'settings', 0, ['settings' => [...$settings, 'frequency' => 'daily'], 'receivers' => [], 'approvers' => []])->assertSessionHasErrors('settings');
        $this->action($head, $branch, 'settings', 0, ['settings' => [...$settings, 'arrangement' => 'separate'], 'receivers' => [], 'approvers' => []])->assertSessionHasErrors('settings');
        $closing->update(['type' => 'daily', 'book' => 'cash', 'workflow_settings' => [...$settings, 'frequency' => 'daily', 'arrangement' => 'separate']]);
        ClosingSetting::ownFor($branch)->update(['frequency' => 'daily', 'arrangement' => 'separate']);
        ClosingSettingChange::factory()->create(['branch_id' => $branch->id, 'settings' => [...$settings, 'frequency' => 'daily', 'arrangement' => 'separate'], 'effective_from' => $closing->coverage_until]);
        $this->travelTo($closing->coverage_until);

        app(BranchClosingWorkflow::class)->refresh($branch->id);

        $next = app(BranchClosingWorkflow::class)->current($branch->id);
        $this->assertSame('combined', $next->book);
        $this->assertSame('weekly', $next->workflow_settings['frequency']);
        $this->assertSame('weekly', ClosingSetting::ownFor($branch)->frequency);
        $this->assertSame(1, Closing::query()->where('branch_id', $branch->id)->where('coverage_from', $closing->coverage_until)->count());
    }

    public function test_package_snapshot_holds_every_sub_box_with_transaction_details(): void
    {
        [$branch, $head, $collector, $closing] = $this->start();
        $cash = $this->entry($branch, $collector);
        $transfer = $this->entry($branch, $collector, CashBoxType::BankTransfer);
        $clearing = $this->entry($branch, $collector, CashBoxType::Clearing);

        $snapshot = app(BranchClosingWorkflow::class)->snapshot($closing);

        $this->assertSame(2, $snapshot['version']);
        $this->assertCount(3, $snapshot['boxes']);
        $this->assertSame($collector->name, $snapshot['boxes'][0]['user']['name']);
        $this->assertSame($cash->transaction->subscription->account_number, $snapshot['boxes'][0]['payments'][0]['transaction']['subscription']['account_number']);
        $this->assertSame($transfer->transaction->reference_number, $snapshot['electronic'][0]['transaction']['reference_number']);
        $this->assertSame('صيانة مولد', $snapshot['clearings'][0]['transaction']['notes']);
    }

    public function test_a_link_to_one_week_opens_it_on_the_weekly_closing_page(): void
    {
        [$branch, $head, , $closing] = $this->start();

        $this->actingAs($head)->get(route('closings.index', ['closing_id' => $closing->id, 'tab' => 'history']))
            ->assertRedirect(route('weekly-packages.index', ['branch_id' => $branch->id, 'closing_id' => $closing->id]));
    }

    public function test_closing_page_lists_each_week_with_where_it_stands_and_the_audit_notes_waiting_on_the_branch(): void
    {
        [$branch, $head, $collector, $closing] = $this->start();
        $this->entry($branch, $collector);
        $this->travelTo($closing->coverage_until);
        $this->actingAs($head)->post(route('closings.actions', ['action' => 'submit', 'record' => $closing->id]), ['branch_id' => $branch->id, 'acknowledged' => true]);
        AuditNote::factory()->create(['closing_id' => $closing->id, 'status' => 'awaiting_reply']);
        AuditNote::factory()->create(['closing_id' => $closing->id, 'status' => 'awaiting_audit']);

        $this->get(route('closings.index', ['tab' => 'history']))->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Closings/Index')
            ->where('weeks', fn ($weeks) => ($week = collect($weeks)->firstWhere('id', $closing->id)) !== null
                && $week['step'] === 'answered' && $week['notes'] === 2 && $week['openNotes'] === 2 && $week['waitingNotes'] === 1 && $week['boxes'] === 1 && $week['entries'] === 1));
    }

    public function test_an_audit_note_on_an_entry_says_which_entry_where_it_sits_and_who_recorded_it(): void
    {
        [$branch, $head, $collector, $closing] = $this->start();
        $entry = $this->entry($branch, $collector);
        $this->travelTo($closing->coverage_until);
        $this->actingAs($head)->post(route('closings.actions', ['action' => 'submit', 'record' => $closing->id]), ['branch_id' => $branch->id, 'acknowledged' => true]);
        AuditNote::factory()->create(['closing_id' => $closing->id, 'cash_box_id' => $entry->cash_box_id, 'cash_box_payment_id' => $entry->id]);
        AuditNote::factory()->create(['closing_id' => $closing->id, 'cash_box_id' => $entry->cash_box_id]);

        $this->get(route('closings.index'))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('notes.1.entry.subscriber', $entry->transaction->subscription->displayName())
            ->where('notes.1.entry.ledger.voucherNumber', $entry->transaction->displayVoucherNumber())
            ->where('notes.1.entry.ledger.recordedByName', $collector->name)
            ->where('notes.1.box.number', $entry->box->number)
            ->where('notes.1.box.person', $collector->name)
            ->where('notes.1.box.url', route('payments.cash-boxes', ['branch_id' => $branch->id, 'box' => $entry->cash_box_id]))
            ->where('notes.0.entry', null)
            ->where('notes.0.box.number', $entry->box->number));
    }

    public function test_closing_page_says_who_manages_the_branch_among_those_it_may_delegate_to(): void
    {
        [, $head, $collector] = $this->start();

        $this->actingAs($head)->get(route('closings.index'))->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Closings/Index')
            ->where('staff', fn ($staff) => collect($staff)->firstWhere('id', $head->id)['isBranchAdmin'] === true
                && collect($staff)->firstWhere('id', $collector->id) === ['id' => $collector->id, 'name' => $collector->name, 'isBranchAdmin' => false]));
    }

    public function test_accepted_entries_are_locked_and_removed_from_carry_over_after_submission(): void
    {
        [$branch, $head, $collector, $closing] = $this->start();
        $entry = $this->entry($branch, $collector, CashBoxType::Clearing);
        $this->action($head, $branch, 'electronic', $entry->id, ['status' => 'confirmed'])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'receive', $entry->cash_box_id)->assertSessionHasNoErrors();
        $this->travelTo($closing->coverage_until);

        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();

        $this->assertDatabaseHas('closing_payments', ['subscription_transaction_id' => $entry->subscription_transaction_id, 'closing_id' => $closing->id]);
        $this->assertTrue($entry->transaction->fresh()->isInClosedDay());
        $this->assertCount(0, $closing->fresh()->submitted_snapshot['carriedOut']['entries']);
    }

    public function test_version_one_saved_package_summary_remains_readable(): void
    {
        [$branch, $head, $collector, $closing] = $this->start();
        $legacy = ['boxes' => [['id' => 1, 'user_id' => $collector->id, 'user' => ['name' => $collector->name], 'type' => 'cash', 'status' => 'received', 'head_counts' => $this->counts()]], 'electronic' => [], 'transfers' => []];

        $summary = app(BranchClosingWorkflow::class)->reviewSummary($closing, $legacy);

        $this->assertSame('100.00', $summary['cash']['ILS']);
        $this->assertSame('0.00', $summary['cashWithCollectors']['ILS']);
        $this->assertSame(0, $summary['carriedOutEntries']);
    }

    public function test_confirmation_of_an_old_received_box_appears_in_the_new_collector_summary(): void
    {
        [$branch, $head, $collector, $closing] = $this->start();
        $entry = $this->entry($branch, $collector, CashBoxType::BankTransfer);
        $this->action($head, $branch, 'electronic', $entry->id, ['status' => 'missing'])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'receive', $entry->cash_box_id)->assertSessionHasNoErrors();
        $this->travelTo($closing->coverage_until);
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();
        $next = app(BranchClosingWorkflow::class)->current($branch->id);

        $this->action($head, $branch, 'electronic', $entry->id, ['status' => 'confirmed'])->assertSessionHasNoErrors();

        $summary = app(BranchClosingWorkflow::class)->reviewSummary($next);
        $this->assertSame('100.00', $summary['byCollector'][0]['bank']['ILS']);
        $this->assertSame($collector->id, $summary['byCollector'][0]['userId']);
        $this->assertSame(1, $summary['byCollector'][0]['boxCount']);
    }

    public function test_a_box_confirmed_after_the_cutoff_stays_in_its_own_week(): void
    {
        [$branch, $head, $collector, $closing] = $this->start();
        $first = $this->entry($branch, $collector);
        $late = $this->entry($branch, User::factory()->collector()->for($branch)->create());
        $this->receiveCash($branch, $head, $collector, $first->box);
        $this->travelTo($closing->coverage_until->addHour());
        app(BranchClosingWorkflow::class)->refresh($branch->id);

        $this->receiveCash($branch, $head, $collector, $late->box);
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();

        $this->assertSame($closing->id, $late->box->fresh()->received_in_closing_id);
        $this->assertSame('200.00', app(BranchClosingWorkflow::class)->reviewSummary($closing->fresh())['cash']['ILS']);
        $this->assertSame('200.00', app(BranchClosingWorkflow::class)->cashLedger($closing->fresh())['received']['ILS']);
    }

    public function test_closing_page_does_not_send_staff_permissions(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->entry($branch, $collector);

        $this->actingAs($head)->get(route('closings.index'))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('boxes.0.user.id', $collector->id)->missing('boxes.0.user.permissions'));
    }
}
