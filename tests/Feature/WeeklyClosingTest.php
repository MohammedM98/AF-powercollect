<?php

namespace Tests\Feature;

use App\Models\AuditNote;
use App\Models\Branch;
use App\Models\CashBox;
use App\Models\Closing;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Support\BranchClosingWorkflow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class WeeklyClosingTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: Branch, 1: User, 2: User} */
    private function start(): array
    {
        $this->travelTo(now()->setDate(2026, 10, 11)->setTime(10, 0));
        $branch = Branch::factory()->create();
        $head = User::factory()->branchAdmin()->for($branch)->create();
        $collector = User::factory()->collector()->for($branch)->create();
        $this->actingAs($head)->post(route('closings.actions', ['action' => 'start']), ['branch_id' => $branch->id])->assertSessionHasNoErrors();

        return [$branch, $head, $collector];
    }

    private function payment(Branch $branch, User $collector, string $amount = '100', string $method = 'cash', array $details = []): SubscriptionTransaction
    {
        return SubscriptionTransaction::factory()->for(Subscription::factory()->for($branch)->create())->create(['recorded_by' => $collector->id, 'type' => 'payment', 'source_key' => 'payment:'.Str::ulid(), 'amount' => '-'.$amount, 'currency_amount' => $amount, 'currency' => 'ILS', 'payment_method' => $method, ...($method === 'cash' ? [] : ['reference_number' => 'REF-'.Str::random(6), 'bank_name' => 'بنك فلسطين']), ...$details]);
    }

    private function action(User $actor, Branch $branch, string $action, int $record, array $data = []): TestResponse
    {
        return $this->actingAs($actor)->post(route('closings.actions', ['action' => $action, 'record' => $record]), ['branch_id' => $branch->id, ...$data]);
    }

    /**
     * A week whose cash box the branch closed, ended and waiting on the
     * branch to confirm it and send it.
     *
     * @return array{0: Branch, 1: User, 2: User, 3: Closing}
     */
    private function endedWeek(): array
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $this->action($head, $branch, 'receive', $box->id, ['cash_counted' => true])->assertSessionHasNoErrors();
        $closing = $box->closing;
        $this->travelTo($closing->coverage_until);

        return [$branch, $head, $collector, $closing];
    }

    private function page(User $actor, array $query = []): TestResponse
    {
        return $this->actingAs($actor)->followingRedirects()->get(route('weekly-packages.index', $query));
    }

    public function test_the_branch_sees_each_weeks_boxes_by_type_and_by_collector(): void
    {
        [$branch, $head, $collector] = $this->start();
        $other = User::factory()->collector()->for($branch)->create();
        $this->payment($branch, $collector, '100');
        $this->payment($branch, $collector, '40', 'bank_transfer');
        $this->payment($branch, $other, '25');
        $this->action($head, $branch, 'receive', CashBox::query()->where('user_id', $other->id)->sole()->id, ['cash_counted' => true])->assertSessionHasNoErrors();
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);

        $this->page($head, ['closing_id' => $closing->id])->assertInertia(fn (AssertableInertia $page) => $page
            ->component('WeeklyClosings/Index')
            ->where('weeks.0.id', $closing->id)->where('weeks.0.year', 2026)->where('weeks.0.month', 10)->where('weeks.0.step', 'review')
            ->where('weeks.0.totals.boxes', 3)->where('weeks.0.totals.closedBoxes', 1)->where('weeks.0.totals.collectors', 2)->where('weeks.0.totals.amounts.ILS', '165.00')
            ->where('selected.totals.byType.0.amounts.ILS', '125.00')
            ->where('selected.totals.byType.1.amounts.ILS', '40.00')
            ->has('selected.totals.byCollector', 2)
            ->where('selected.can.submit', false));

        $this->page($head, ['closing_id' => $closing->id, 'user_id' => $other->id])->assertInertia(fn (AssertableInertia $page) => $page
            ->where('selected.totals.amounts.ILS', '25.00')->has('selected.boxes', 1)->where('selected.weekTotals.amounts.ILS', '165.00'));
        $this->page($head, ['year' => 2026, 'month' => 9])->assertInertia(fn (AssertableInertia $page) => $page->has('weeks', 0));
    }

    public function test_an_ended_week_is_confirmed_and_sent_to_audit_in_one_step(): void
    {
        [$branch, $head, , $closing] = $this->endedWeek();

        $this->page($head, ['closing_id' => $closing->id])->assertInertia(fn (AssertableInertia $page) => $page
            ->where('selected.step', 'confirm')->where('selected.can.submit', true)->where('selected.blockers', []));
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();

        $this->assertSame('submitted', $closing->fresh()->status->value);
        $this->page($head, ['closing_id' => $closing->id])->assertInertia(fn (AssertableInertia $page) => $page
            ->where('selected.step', 'audit')->where('selected.frozen', true)->where('selected.can.submit', false)->missing('selected.can.withdraw')
            ->where('selected.boxes.0.payments.0.amount', '100.00')->where('selected.boxes.0.payments.0.transactionStatus', 'active'));

        AuditNote::query()->create(['closing_id' => $closing->id, 'body' => 'راجعوا الصندوق']);
        $this->page($head, ['step' => 'answered'])->assertInertia(fn (AssertableInertia $page) => $page
            ->where('weeks.0.id', $closing->id)->has('weeks', 1));
    }

    public function test_the_page_opens_on_the_week_waiting_on_the_branch(): void
    {
        [, $head, , $closing] = $this->endedWeek();

        $this->actingAs($head)->get(route('weekly-packages.index'))->assertRedirect(route('weekly-packages.index', ['closing_id' => $closing->id]));
        $this->page($head)->assertInertia(fn (AssertableInertia $page) => $page
            ->whereNot('weeks.0.id', $closing->id)
            ->where('selected.id', $closing->id)->where('selected.step', 'confirm'));
    }

    public function test_each_box_lists_its_entries_with_the_banks_a_transfer_went_between(): void
    {
        [$branch, $head, $collector] = $this->start();
        $transfer = $this->payment($branch, $collector, '40', 'bank_transfer', ['sender_name' => 'هدى خالد', 'sender_bank_name' => 'بنك القدس']);
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);

        $this->page($head, ['closing_id' => $closing->id])->assertInertia(fn (AssertableInertia $page) => $page
            ->where('selected.boxes.0.type', 'bank_transfer')
            ->has('selected.boxes.0.payments', 1)
            ->where('selected.boxes.0.payments.0.amount', '40.00')
            ->where('selected.boxes.0.payments.0.accountNumber', $transfer->subscription->account_number)
            ->where('selected.boxes.0.payments.0.reference', $transfer->reference_number)
            ->where('selected.boxes.0.payments.0.bankName', 'بنك فلسطين')
            ->where('selected.boxes.0.payments.0.senderBank', 'بنك القدس')
            ->where('selected.boxes.0.payments.0.senderName', 'هدى خالد'));
    }

    public function test_a_branch_holding_cash_sends_the_week_without_a_safe_count_or_delivery(): void
    {
        [, $head, , $closing] = $this->endedWeek();

        $this->page($head, ['closing_id' => $closing->id])->assertInertia(fn (AssertableInertia $page) => $page
            ->where('selected.blockers', [])->where('selected.can.submit', true)
            ->missing('selected.can.countSafe')->missing('selected.cashLedger'));
    }

    public function test_only_the_running_week_can_be_closed_early(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);

        $this->page($head, ['closing_id' => $closing->id])->assertInertia(fn (AssertableInertia $page) => $page->where('selected.can.closeEarly', true));
        $this->action($head, $branch, 'early', $closing->id)->assertSessionHasNoErrors();

        $this->page($head, ['closing_id' => $closing->id])->assertInertia(fn (AssertableInertia $page) => $page
            ->where('selected.step', 'confirm')->where('selected.can.closeEarly', false));
    }

    public function test_the_version_sent_is_listed_with_what_it_held(): void
    {
        [$branch, $head, , $closing] = $this->endedWeek();
        $this->action($head, $branch, 'submit', $closing->id, ['acknowledged' => true, 'notes' => 'الأولى'])->assertSessionHasNoErrors();

        $this->page($head, ['closing_id' => $closing->id])->assertInertia(fn (AssertableInertia $page) => $page
            ->has('selected.versions', 1)
            ->where('selected.versions.0.version', 1)->where('selected.versions.0.withdrawnAt', null)->where('selected.versions.0.cash.ILS', '100.00')
            ->where('selected.versions.0.by', $head->name)->where('selected.versions.0.notes', 'الأولى'));
    }

    public function test_only_branch_closers_open_the_page(): void
    {
        [$branch, , $collector] = $this->start();

        $this->page($collector)->assertForbidden();
        $this->page(User::factory()->branchAdmin()->create(), ['branch_id' => $branch->id])->assertInertia(fn (AssertableInertia $page) => $page->whereNot('branch.id', $branch->id));
    }
}
