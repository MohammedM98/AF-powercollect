<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\CashBox;
use App\Models\CashBoxPayment;
use App\Models\Closing;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Notifications\BranchClosingNotification;
use App\Support\BranchClosingWorkflow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class SendCashBoxesToAuditTest extends TestCase
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

    private function box(Branch $branch, User $collector, string $method = 'cash'): CashBox
    {
        $payment = SubscriptionTransaction::recordPayment(Subscription::factory()->for($branch)->create(), $collector, ['amount' => '100', 'currency' => 'ILS', 'payment_method' => $method, 'bank_name' => 'بنك فلسطين', 'reference_number' => 'TRX-'.$collector->id.'-'.CashBoxPayment::query()->count()]);

        return CashBoxPayment::query()->where('subscription_transaction_id', $payment->id)->sole()->box;
    }

    /** @param array<string, mixed> $data */
    private function action(User $actor, Branch $branch, string $action, ?int $record = null, array $data = []): TestResponse
    {
        return $this->actingAs($actor)->post(route('payments.cash-boxes.actions', ['action' => $action, 'record' => $record]), ['branch_id' => $branch->id, ...$data]);
    }

    private function closed(Branch $branch, User $head, User $collector, string $method = 'cash'): CashBox
    {
        $box = $this->box($branch, $collector, $method);
        $this->action($head, $branch, 'receive', $box->id)->assertSessionHasNoErrors();

        return $box->fresh();
    }

    public function test_the_branch_sends_several_closed_boxes_at_once_and_each_reaches_the_audit_on_its_own(): void
    {
        Notification::fake();
        [$branch, $head, $collector] = $this->start();
        $auditor = User::factory()->financialAuditor()->create();
        $cash = $this->closed($branch, $head, $collector);
        $transfer = $this->closed($branch, $head, $collector, 'bank_transfer');
        $this->travel(2)->hours();

        $this->action($head, $branch, 'send', data: ['box_ids' => [$cash->id, $transfer->id], 'note' => 'الحوالة وصلت متأخرة'])->assertSessionHasNoErrors();

        foreach ([$cash, $transfer] as $box) {
            $this->assertDatabaseHas('cash_boxes', ['id' => $box->id, 'sent_by' => $head->id, 'sent_at' => now(), 'send_note' => 'الحوالة وصلت متأخرة', 'audit_status' => 'waiting']);
        }
        Notification::assertSentTo($auditor, BranchClosingNotification::class, fn (BranchClosingNotification $notification): bool => $notification->subject === "{$cash->number}، {$transfer->number}");
    }

    public function test_only_closed_boxes_not_sent_yet_are_sent_and_nothing_is_sent_when_one_of_them_is_not(): void
    {
        [$branch, $head, $collector] = $this->start();
        $open = $this->box($branch, $collector);
        $closed = $this->closed($branch, $head, User::factory()->collector()->for($branch)->create());
        $sent = $this->closed($branch, $head, User::factory()->collector()->for($branch)->create(), 'bank_transfer');
        $this->action($head, $branch, 'send', data: ['box_ids' => [$sent->id]])->assertSessionHasNoErrors();

        $this->action($head, $branch, 'send', data: ['box_ids' => [$closed->id, $open->id]])->assertSessionHasErrors('action');
        $this->action($head, $branch, 'send', data: ['box_ids' => [$closed->id, $sent->id]])->assertSessionHasErrors('action');
        $this->action($head, $branch, 'send', data: ['box_ids' => []])->assertSessionHasErrors('box_ids');

        $this->assertNull($closed->fresh()->sent_at);
        $this->assertNull($open->fresh()->sent_at);
    }

    public function test_sending_needs_the_permission_and_stays_within_the_branch(): void
    {
        [$branch, $head, $collector] = $this->start();
        $box = $this->closed($branch, $head, $collector);
        $closer = User::factory()->accountant()->for($branch)->withPermissions([PermissionKey::CloseCashBoxes])->create();
        $sender = User::factory()->accountant()->for($branch)->withPermissions([PermissionKey::SendCashBoxesToAudit])->create();
        $outsider = User::factory()->branchAdmin()->create();

        $this->action($closer, $branch, 'send', data: ['box_ids' => [$box->id]])->assertForbidden();
        $this->action($outsider, $branch, 'send', data: ['box_ids' => [$box->id]])->assertNotFound();
        $this->action($outsider, $outsider->branch, 'send', data: ['box_ids' => [$box->id]])->assertNotFound();
        $this->assertNull($box->fresh()->sent_at);

        $this->action($sender, $branch, 'send', data: ['box_ids' => [$box->id]])->assertSessionHasNoErrors();
        $this->assertSame($sender->id, $box->fresh()->sent_by);
    }

    public function test_open_closed_and_sent_boxes_each_have_their_own_tab_with_when_and_by_whom(): void
    {
        [$branch, $head, $collector] = $this->start();
        $open = $this->box($branch, $collector);
        $closed = $this->closed($branch, $head, User::factory()->collector()->for($branch)->create());
        $sent = $this->closed($branch, $head, User::factory()->collector()->for($branch)->create(), 'bank_transfer');
        $this->travel(1)->hours();
        $this->action($head, $branch, 'send', data: ['box_ids' => [$sent->id]])->assertSessionHasNoErrors();

        $this->actingAs($head)->get(route('payments.cash-boxes', ['place' => 'open']))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('place', 'open')->has('boxes', 1)->where('boxes.0.id', $open->id)->where('boxes.0.place', 'open')
            ->where('tabs.0.count', 1)->where('tabs.1.count', 1)->where('tabs.2.count', 1));
        $this->get(route('payments.cash-boxes'))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('place', 'closed')->has('boxes', 1)->where('boxes.0.id', $closed->id)
            ->where('boxes.0.closedBy', $head->name)->where('boxes.0.sent_at', null)->where('boxes.0.canSend', true));
        $this->get(route('payments.cash-boxes', ['place' => 'sent']))->assertInertia(fn (AssertableInertia $page) => $page
            ->has('boxes', 1)->where('boxes.0.id', $sent->id)->where('boxes.0.audit_status', 'waiting')
            ->where('boxes.0.closedBy', $head->name)->where('boxes.0.sentBy', $head->name)
            ->where('boxes.0.opened_at', $sent->opened_at->toJSON())->where('boxes.0.sent_at', now()->toJSON()));
    }

    public function test_boxes_of_weeks_sent_before_count_as_sent_by_whoever_sent_the_week_and_branch_admins_may_send(): void
    {
        $this->freezeTime();
        $migration = require database_path('migrations/2026_10_17_120000_send_cash_boxes_to_audit_one_by_one.php');
        $migration->down();
        $branch = Branch::factory()->create();
        $head = User::factory()->branchAdmin()->for($branch)->create();
        $sentWeek = Closing::factory()->for($branch)->create(['workflow_settings' => ['frequency' => 'weekly'], 'submitted_at' => now()->subDay(), 'branch_approved_by' => $head->id]);
        $openWeek = Closing::factory()->for($branch)->create(['workflow_settings' => ['frequency' => 'weekly']]);
        $sentBox = CashBox::factory()->create(['branch_id' => $branch->id, 'closing_id' => $sentWeek->id, 'received_in_closing_id' => $sentWeek->id, 'status' => 'received', 'received_at' => now()]);
        $unsentBox = CashBox::factory()->create(['branch_id' => $branch->id, 'closing_id' => $openWeek->id, 'received_in_closing_id' => $openWeek->id, 'status' => 'received', 'received_at' => now()]);

        $migration->up();

        $this->assertDatabaseHas('cash_boxes', ['id' => $sentBox->id, 'sent_at' => now()->subDay(), 'sent_by' => $head->id, 'audit_status' => 'waiting']);
        $this->assertDatabaseHas('cash_boxes', ['id' => $unsentBox->id, 'sent_at' => null, 'audit_status' => null]);
        $this->assertTrue($head->fresh()->hasPermission(PermissionKey::SendCashBoxesToAudit));
    }
}
