<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\CashBox;
use App\Models\Closing;
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

    private function payment(Branch $branch, User $collector, string $amount = '100', string $method = 'cash'): SubscriptionTransaction
    {
        return SubscriptionTransaction::factory()->for(Subscription::factory()->for($branch)->create())->create(['recorded_by' => $collector->id, 'type' => 'payment', 'source_key' => 'payment:'.Str::ulid(), 'amount' => '-'.$amount, 'currency_amount' => $amount, 'currency' => 'ILS', 'payment_method' => $method, ...($method === 'cash' ? [] : ['reference_number' => 'REF-'.Str::random(6), 'bank_name' => 'بنك فلسطين'])]);
    }

    private function action(User $actor, Branch $branch, string $action, int $record, array $data = []): TestResponse
    {
        return $this->actingAs($actor)->post(route('closings.actions', ['action' => $action, 'record' => $record]), ['branch_id' => $branch->id, ...$data]);
    }

    /**
     * A week whose cash box the branch confirmed closed and whose safe it
     * counted, ended and ready for the branch to close.
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
        $this->action($head, $branch, 'safe-count', $closing->id, ['counts' => ['ILS' => '100', 'USD' => '0', 'JOD' => '0']])->assertSessionHasNoErrors();

        return [$branch, $head, $collector, $closing];
    }

    public function test_the_branch_closes_the_week_its_collectors_confirm_it_and_then_it_goes_to_audit(): void
    {
        Notification::fake();
        [$branch, $head, $collector, $closing] = $this->endedWeek();
        $auditor = User::factory()->financialAuditor()->create();

        $this->action($head, $branch, 'lock', $closing->id, ['acknowledged' => true, 'notes' => 'تمت المراجعة'])->assertSessionHasNoErrors();

        $closing->refresh();
        $this->assertSame('locked', $closing->status->value);
        $this->assertNull($closing->submitted_at);
        $this->assertNotNull($closing->submitted_snapshot);
        $this->assertDatabaseHas('closing_confirmations', ['closing_id' => $closing->id, 'user_id' => $collector->id, 'confirmed_at' => null]);
        Notification::assertSentTo($collector, BranchClosingNotification::class);
        Notification::assertNotSentTo($auditor, BranchClosingNotification::class);

        $this->action($head, $branch, 'submit', $closing->id)->assertSessionHasErrors('action');
        $this->action($collector, $branch, 'acknowledge', $closing->id)->assertSessionHasNoErrors();
        $this->action($collector, $branch, 'acknowledge', $closing->id)->assertSessionHasErrors('action');
        $this->action($head, $branch, 'submit', $closing->id)->assertSessionHasNoErrors();

        $closing->refresh();
        $this->assertSame('submitted', $closing->status->value);
        $this->assertNotNull($closing->submitted_at);
        Notification::assertSentTo($auditor, BranchClosingNotification::class);
    }

    public function test_only_those_who_approve_the_branch_close_and_send_the_week(): void
    {
        [$branch, , $collector, $closing] = $this->endedWeek();

        $this->action($collector, $branch, 'lock', $closing->id, ['acknowledged' => true])->assertForbidden();
        $this->action($collector, $branch, 'submit', $closing->id)->assertForbidden();
        $this->action($collector, $branch, 'acknowledge', $closing->id)->assertSessionHasErrors('action');

        $this->assertSame('draft', $closing->fresh()->status->value);
    }

    public function test_the_one_closing_the_week_confirms_their_own_boxes_by_closing_it(): void
    {
        [$branch, $head] = $this->start();
        $this->payment($branch, $head);
        $box = CashBox::query()->sole();
        $this->action($head, $branch, 'receive', $box->id, ['cash_counted' => true])->assertSessionHasNoErrors();
        $closing = $box->closing;
        $this->travelTo($closing->coverage_until);
        $this->action($head, $branch, 'safe-count', $closing->id, ['counts' => ['ILS' => '100', 'USD' => '0', 'JOD' => '0']])->assertSessionHasNoErrors();

        $this->action($head, $branch, 'lock', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();
        $this->action($head, $branch, 'submit', $closing->id)->assertSessionHasNoErrors();

        $this->assertSame('submitted', $closing->fresh()->status->value);
    }

    public function test_reopening_a_closed_week_drops_its_confirmations(): void
    {
        [$branch, $head, $collector, $closing] = $this->endedWeek();
        $this->action($head, $branch, 'lock', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();
        $this->action($collector, $branch, 'acknowledge', $closing->id)->assertSessionHasNoErrors();

        $this->action($head, $branch, 'withdraw', $closing->id)->assertSessionHasNoErrors();

        $closing->refresh();
        $this->assertSame('draft', $closing->status->value);
        $this->assertNull($closing->submitted_snapshot);
        $this->assertDatabaseCount('closing_confirmations', 0);
    }

    public function test_a_box_confirmed_after_its_week_was_closed_settles_in_the_open_week(): void
    {
        [$branch, $head, $collector] = $this->start();
        $this->payment($branch, $collector);
        $box = CashBox::query()->sole();
        $closing = $box->closing;
        $this->travelTo($closing->coverage_until);
        $this->action($head, $branch, 'lock', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();

        $this->action($head, $branch, 'receive', $box->id, ['cash_counted' => true])->assertSessionHasNoErrors();

        $this->assertSame(app(BranchClosingWorkflow::class)->current($branch->id)->id, $box->fresh()->received_in_closing_id);
    }

    public function test_the_branch_sees_each_weeks_boxes_by_type_and_by_collector(): void
    {
        [$branch, $head, $collector] = $this->start();
        $other = User::factory()->collector()->for($branch)->create();
        $this->payment($branch, $collector, '100');
        $this->payment($branch, $collector, '40', 'bank_transfer');
        $this->payment($branch, $other, '25');
        $closing = app(BranchClosingWorkflow::class)->current($branch->id);

        $this->actingAs($head)->get(route('weekly-packages.index', ['closing_id' => $closing->id]))->assertInertia(fn (AssertableInertia $page) => $page
            ->component('WeeklyClosings/Index')
            ->where('mode', 'branch')
            ->where('weeks.0.id', $closing->id)
            ->where('weeks.0.year', 2026)->where('weeks.0.month', 10)
            ->where('weeks.0.totals.boxes', 3)->where('weeks.0.totals.collectors', 2)->where('weeks.0.totals.amounts.ILS', '165.00')
            ->where('selected.step', 'review')
            ->where('selected.totals.byType.0.amounts.ILS', '125.00')
            ->where('selected.totals.byType.1.amounts.ILS', '40.00')
            ->has('selected.totals.byCollector', 2));

        $this->get(route('weekly-packages.index', ['closing_id' => $closing->id, 'user_id' => $other->id]))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('selected.totals.amounts.ILS', '25.00')->has('selected.boxes', 1));
        $this->get(route('weekly-packages.index', ['year' => 2026, 'month' => 9]))->assertInertia(fn (AssertableInertia $page) => $page->has('weeks', 0));
    }

    public function test_a_collector_sees_only_their_own_boxes_and_confirms_from_the_page(): void
    {
        [$branch, $head, $collector, $closing] = $this->endedWeek();
        $other = User::factory()->collector()->for($branch)->create();
        $this->action($head, $branch, 'lock', $closing->id, ['acknowledged' => true])->assertSessionHasNoErrors();

        $this->actingAs($collector)->get(route('weekly-packages.index', ['closing_id' => $closing->id]))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('mode', 'collector')->where('people', [])
            ->where('selected.step', 'confirm')->where('selected.can.acknowledge', true)->where('selected.can.lock', false)
            ->has('selected.boxes', 1)->where('selected.boxes.0.userId', $collector->id));
        $this->get(route('payments.summary'))->assertInertia(fn (AssertableInertia $page) => $page->where('weeklyConfirmations.0.id', $closing->id));

        $this->actingAs($other)->get(route('weekly-packages.index'))->assertInertia(fn (AssertableInertia $page) => $page->has('weeks', 0));
        $this->get(route('weekly-packages.index', ['closing_id' => $closing->id]))->assertNotFound();
        $this->actingAs(User::factory()->dataEntry()->for($branch)->create())->get(route('weekly-packages.index'))->assertForbidden();
    }
}
