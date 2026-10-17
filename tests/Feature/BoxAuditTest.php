<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Models\AuditNote;
use App\Models\Branch;
use App\Models\CashBox;
use App\Models\CashBoxPayment;
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

class BoxAuditTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{Branch, User, User} */
    private function start(): array
    {
        $this->travelTo(now()->setDate(2026, 10, 11)->setTime(10, 0));
        $branch = Branch::factory()->create();
        $head = User::factory()->branchAdmin()->for($branch)->create();
        $auditor = User::factory()->financialAuditor()->create();
        app(BranchClosingWorkflow::class)->start($branch->id, $head);

        return [$branch, $head, $auditor];
    }

    /** A box of a new collector of the branch, with two payments, closed and sent to audit by the branch admin. */
    private function sentBox(Branch $branch, User $head): CashBox
    {
        $collector = User::factory()->collector()->for($branch)->create();
        foreach (['100', '40'] as $amount) {
            SubscriptionTransaction::recordPayment(Subscription::factory()->for($branch)->create(), $collector, ['amount' => $amount, 'currency' => 'ILS', 'payment_method' => 'cash']);
        }
        $box = CashBox::query()->where('user_id', $collector->id)->sole();
        $this->actingAs($head)->post(route('payments.cash-boxes.actions', ['action' => 'receive', 'record' => $box->id]), ['branch_id' => $branch->id])->assertSessionHasNoErrors();
        $this->post(route('payments.cash-boxes.actions', ['action' => 'send']), ['branch_id' => $branch->id, 'box_ids' => [$box->id]])->assertSessionHasNoErrors();

        return $box->fresh();
    }

    /** @param array<string, mixed> $data */
    private function audit(User $actor, CashBox $box, string $action, array $data = []): TestResponse
    {
        return $this->actingAs($actor)->post(route('box-audit.actions', ['cashBox' => $box->id, 'action' => $action]), $data);
    }

    public function test_only_the_audit_opens_the_branches_boxes(): void
    {
        [$branch, $head, $auditor] = $this->start();
        $box = $this->sentBox($branch, $head);

        $this->actingAs($head)->get(route('box-audit.index'))->assertForbidden();
        $this->audit($head, $box, 'approve')->assertForbidden();
        $this->actingAs($auditor)->get(route('box-audit.index'))->assertOk();
        $this->actingAs(User::factory()->superAdmin()->create())->get(route('box-audit.index'))->assertOk();
    }

    public function test_the_audit_sees_each_box_sent_on_its_own_with_the_branch_that_sent_it(): void
    {
        [$branch, $head, $auditor] = $this->start();
        $first = $this->sentBox($branch, $head);
        $this->travel(1)->hours();
        $second = $this->sentBox($branch, $head);
        $other = Branch::factory()->create();
        $otherHead = User::factory()->branchAdmin()->for($other)->create();
        app(BranchClosingWorkflow::class)->start($other->id, $otherHead);
        $elsewhere = $this->sentBox($other, $otherHead);

        $this->actingAs($auditor)->get(route('box-audit.index'))->assertInertia(fn (AssertableInertia $page) => $page
            ->component('BoxAudit/Index')
            ->where('filters.status', 'waiting')
            ->where('boxes', fn ($boxes): bool => collect($boxes)->pluck('id')->all() === [$first->id, $second->id, $elsewhere->id])
            ->where('boxes.0.branchName', $branch->name)
            ->where('boxes.0.sentBy', $head->name)
            ->where('boxes.0.closedBy', $head->name)
            ->where('counts.waiting', 3)
            ->where('branches', fn ($branches): bool => collect($branches)->firstWhere('id', $branch->id)['waiting'] === 2));
        $this->get(route('box-audit.index', ['branch_id' => $other->id]))->assertInertia(fn (AssertableInertia $page) => $page
            ->has('boxes', 1)->where('boxes.0.id', $elsewhere->id)->where('boxes.0.branchName', $other->name));
    }

    public function test_the_auditor_approves_a_box_and_may_charge_the_branch_a_debt_for_it(): void
    {
        Notification::fake();
        [$branch, $head, $auditor] = $this->start();
        $box = $this->sentBox($branch, $head);

        $this->audit($auditor, $box, 'start')->assertSessionHasNoErrors();
        $this->assertSame('reviewing', $box->fresh()->audit_status);
        $this->audit($auditor, $box, 'approve', ['debt' => '15'])->assertSessionHasErrors('action');
        $this->audit($auditor, $box, 'approve', ['debt' => '15', 'debt_reason' => 'عجز في النقد'])->assertSessionHasNoErrors();

        $this->assertDatabaseHas('cash_boxes', ['id' => $box->id, 'audit_status' => 'approved', 'audited_by' => $auditor->id, 'audited_at' => now(), 'branch_debt' => '15.00', 'branch_debt_reason' => 'عجز في النقد']);
        Notification::assertSentTo($head, BranchClosingNotification::class, fn (BranchClosingNotification $notification): bool => $notification->subject === $box->number);
        $this->audit($auditor, $box, 'return', ['body' => 'متأخر'])->assertSessionHasErrors('action');
    }

    public function test_a_box_sent_back_with_notes_returns_to_audit_with_the_branchs_answer(): void
    {
        [$branch, $head, $auditor] = $this->start();
        $box = $this->sentBox($branch, $head);
        $entry = CashBoxPayment::query()->where('cash_box_id', $box->id)->orderBy('id')->first();
        $sender = User::factory()->accountant()->for($branch)->withPermissions([PermissionKey::SendCashBoxesToAudit])->create();
        $closer = User::factory()->accountant()->for($branch)->withPermissions([PermissionKey::CloseCashBoxes])->create();
        $answer = fn (User $actor, string $body): TestResponse => $this->actingAs($actor)->post(route('payments.cash-boxes.actions', ['action' => 'answer', 'record' => $box->id]), ['branch_id' => $branch->id, 'body' => $body]);

        $this->audit($auditor, $box, 'return', ['body' => 'رقم السند لا يطابق الإيصال', 'entry_ids' => [$entry->id]])->assertSessionHasNoErrors();
        $this->assertDatabaseHas('audit_notes', ['cash_box_id' => $box->id, 'cash_box_payment_id' => $entry->id, 'status' => 'awaiting_reply']);
        $this->assertSame('returned', $box->fresh()->audit_status);
        $this->audit($auditor, $box, 'approve')->assertSessionHasErrors('action');
        $this->actingAs($sender)->get(route('payments.cash-boxes', ['place' => 'sent']))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('tabs.2.alert', 1)->where('boxes.0.notes.0.entryId', $entry->id)->where('boxes.0.notes.0.body', 'رقم السند لا يطابق الإيصال'));

        $answer($closer, 'تم')->assertForbidden();
        $answer($sender, 'صحّحنا رقم السند وأرفقنا الإيصال')->assertSessionHasNoErrors();

        $note = AuditNote::query()->sole();
        $this->assertSame('awaiting_audit', $note->status);
        $this->assertSame(['clarification', 'صحّحنا رقم السند وأرفقنا الإيصال', $sender->id], [$note->replies()->sole()->kind, $note->replies()->sole()->body, $note->replies()->sole()->user_id]);
        $this->assertSame('waiting', $box->fresh()->audit_status);
        $this->audit($auditor, $box, 'approve')->assertSessionHasNoErrors();
        $this->assertSame('closed', $note->fresh()->status);
    }

    public function test_a_note_on_an_entry_of_another_box_is_refused(): void
    {
        [$branch, $head, $auditor] = $this->start();
        $box = $this->sentBox($branch, $head);
        $other = $this->sentBox($branch, $head);
        $foreign = CashBoxPayment::query()->where('cash_box_id', $other->id)->first();

        $this->audit($auditor, $box, 'return', ['body' => 'خطأ', 'entry_ids' => [$foreign->id]])->assertSessionHasErrors('action');
        $this->audit($auditor, $box, 'return', ['body' => ''])->assertSessionHasErrors('body');

        $this->assertDatabaseCount('audit_notes', 0);
        $this->assertSame('waiting', $box->fresh()->audit_status);
    }

    public function test_a_box_not_sent_cannot_be_audited(): void
    {
        [$branch, $head, $auditor] = $this->start();
        SubscriptionTransaction::recordPayment(Subscription::factory()->for($branch)->create(), User::factory()->collector()->for($branch)->create(), ['amount' => '100', 'currency' => 'ILS', 'payment_method' => 'cash']);
        $box = CashBox::query()->sole();

        $this->audit($auditor, $box, 'approve')->assertForbidden();

        $this->assertNull($box->fresh()->audit_status);
    }
}
