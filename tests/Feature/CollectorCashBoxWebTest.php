<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Models\AuditNote;
use App\Models\Branch;
use App\Models\CashBox;
use App\Models\Closing;
use App\Models\ClosingSetting;
use App\Models\CollectorDebt;
use App\Models\MobileAccessToken;
use App\Models\Permission;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Support\BranchClosingWorkflow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class CollectorCashBoxWebTest extends TestCase
{
    use RefreshDatabase;

    private function collector(Branch $branch): User
    {
        $collector = User::factory()->collector()->for($branch)->create();
        $permission = Permission::firstOrCreate(['key' => PermissionKey::RecordCollections->value], ['label' => PermissionKey::RecordCollections->label()]);
        $collector->permissions()->syncWithoutDetaching($permission);

        return $collector;
    }

    private function start(): array
    {
        $this->travelTo(now()->setDate(2026, 10, 11)->setTime(10, 0));
        $branch = Branch::factory()->create();
        $head = User::factory()->branchAdmin()->for($branch)->create();
        app(BranchClosingWorkflow::class)->start($branch->id, $head);

        return [$branch, $head, $this->collector($branch)];
    }

    private function payment(Branch $branch, User $collector): CashBox
    {
        SubscriptionTransaction::recordPayment(Subscription::factory()->for($branch)->create(), $collector, ['amount' => '100', 'currency' => 'ILS', 'payment_method' => 'cash']);

        return CashBox::query()->where('user_id', $collector->id)->where('status', 'open')->sole();
    }

    private function counts(): array
    {
        return ['ILS' => '100', 'USD' => '0', 'JOD' => '0'];
    }

    public function test_payments_page_does_not_activate_the_branch_workflow(): void
    {
        $branch = Branch::factory()->create();
        $collector = $this->collector($branch);

        $this->actingAs($collector)->get(route('payments.summary'))
            ->assertInertia(fn (AssertableInertia $page) => $page->where('cashBox.started', false)->has('cashBox.boxes', 0));

        $this->assertNull(ClosingSetting::ownFor($branch->id)?->workflow_started_at);
        $this->assertDatabaseCount('cash_boxes', 0);
    }

    public function test_collector_sees_only_own_branch_boxes_without_branch_review_access(): void
    {
        [$branch, $head, $collector] = $this->start();
        $box = $this->payment($branch, $collector);
        $this->payment($branch, $head);
        $otherBranch = Branch::factory()->create();
        CashBox::factory()->create(['branch_id' => $otherBranch->id, 'user_id' => $collector->id]);

        $this->actingAs($collector)->get(route('payments.summary'))
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->where('cashBox.started', true)
                ->has('cashBox.boxes', 1)
                ->where('cashBox.boxes.0.id', $box->id)
                ->where('cashBox.boxes.0.paymentCount', 1)
                ->where('cashBox.boxes.0.expectedCounts', null)
                ->where('cashBox.boxes.0.stage', 'open')
                ->where('cashBox.boxes.0.urls.confirm', route('closings.actions', ['action' => 'confirm', 'record' => $box->id])));

        $this->get(route('closings.index'))->assertForbidden();
    }

    public function test_branch_close_is_visible_to_the_collector_and_new_payment_uses_new_box(): void
    {
        [$branch, $head, $collector] = $this->start();
        $box = $this->payment($branch, $collector);

        $this->actingAs($collector)->post(route('closings.actions', ['action' => 'close', 'record' => $box->id]), ['branch_id' => $branch->id, 'counts' => $this->counts()])->assertForbidden();
        $this->actingAs($head)->post(route('closings.actions', ['action' => 'receive', 'record' => $box->id]), ['branch_id' => $branch->id, 'cash_counted' => true])->assertSessionHasNoErrors();

        $this->assertDatabaseHas('cash_boxes', ['id' => $box->id, 'status' => 'received', 'close_reason' => 'manual', 'received_by' => $head->id]);
        $next = $this->payment($branch, $collector);
        $this->assertNotSame($box->id, $next->id);
        $this->assertDatabaseHas('cash_box_payments', ['cash_box_id' => $next->id, 'amount' => '100.00']);
        $this->withToken(MobileAccessToken::issue($collector))->getJson(route('mobile.cash-boxes.index'))
            ->assertJsonPath('boxes.1.id', $box->id)->assertJsonPath('boxes.1.stage', 'completed');
        $this->actingAs($collector)->get(route('payments.summary'))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('cashBox.boxes.1.id', $box->id)->where('cashBox.boxes.1.stage', 'completed')->where('cashBox.boxes.1.closedBy', $head->name)->where('cashBox.current.cash.id', $next->id));
    }

    public function test_branch_confirmation_completes_the_box_with_nothing_left_for_the_collector(): void
    {
        [$branch, $head, $collector] = $this->start();
        $box = $this->payment($branch, $collector);
        $token = MobileAccessToken::issue($collector);
        $this->withToken($token)->postJson(route('mobile.cash-boxes.actions', ['action' => 'close', 'record' => $box->id]), ['branch_id' => $branch->id])->assertForbidden();

        $this->actingAs($head)->post(route('closings.actions', ['action' => 'receive', 'record' => $box->id]), ['branch_id' => $branch->id, 'cash_counted' => true])->assertSessionHasNoErrors();
        $this->actingAs($collector)->get(route('payments.summary'))
            ->assertInertia(fn (AssertableInertia $page) => $page->where('cashBox.boxes.0.stage', 'completed')->where('cashBox.boxes.0.receivedAmounts.ILS', '100.00')
                ->where('cashBox.boxes.0.differences.ILS', '0.00')->has('cashBox.needsAction', 0));
        $this->post(route('closings.actions', ['action' => 'confirm', 'record' => $box->id]), ['branch_id' => $branch->id])->assertSessionHasErrors('action');
    }

    public function test_automatic_cutoff_leaves_the_box_for_the_branch(): void
    {
        [$branch, $head, $collector] = $this->start();
        $box = $this->payment($branch, $collector);
        $this->travelTo($box->closing->coverage_until->addMinute());

        $this->actingAs($collector)->get(route('payments.summary'))
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->where('cashBox.boxes.0.status', 'pending')
                ->where('cashBox.boxes.0.stage', 'awaiting_branch')
                ->where('cashBox.boxes.0.expectedCounts', null)
                ->has('cashBox.needsAction', 0));
        $this->post(route('closings.actions', ['action' => 'collector-count', 'record' => $box->id]), ['branch_id' => $branch->id, 'counts' => $this->counts()])->assertForbidden();

        $this->actingAs($head)->post(route('closings.actions', ['action' => 'receive', 'record' => $box->id]), ['branch_id' => $branch->id, 'cash_counted' => true])->assertSessionHasNoErrors();
        $this->assertSame(['ILS' => '100.00', 'USD' => '0.00', 'JOD' => '0.00'], $box->fresh()->head_counts);
    }

    public function test_collector_cannot_close_another_collectors_box_or_another_branch_box(): void
    {
        [$branch, $head, $collector] = $this->start();
        $box = $this->payment($branch, $head);

        $this->actingAs($collector)->post(route('closings.actions', ['action' => 'receive', 'record' => $box->id]), ['branch_id' => $branch->id, 'cash_counted' => true])->assertForbidden();

        $this->assertDatabaseHas('cash_boxes', ['id' => $box->id, 'status' => 'open', 'head_counts' => null]);
        $this->post(route('closings.actions', ['action' => 'receive', 'record' => $box->id]), ['branch_id' => Branch::factory()->create()->id])->assertNotFound();
        $this->assertDatabaseHas('cash_boxes', ['id' => $box->id, 'status' => 'open', 'head_counts' => null]);
    }

    public function test_cash_box_page_requires_payment_access_and_sign_in(): void
    {
        foreach (['payments.summary', 'payments.cash-boxes'] as $page) {
            $this->get(route($page))->assertRedirect(route('login'));
            $this->actingAs(User::factory()->dataEntry()->create())->get(route($page))->assertForbidden();
            auth()->logout();
        }
    }

    public function test_summary_shows_action_boxes_and_the_boxes_page_paginates_only_own_boxes(): void
    {
        [$branch, $head, $collector] = $this->start();
        $pending = CashBox::factory()->create(['branch_id' => $branch->id, 'user_id' => $collector->id, 'status' => 'received', 'open_key' => null, 'closed_at' => now(), 'received_at' => now(), 'head_counts' => $this->counts(), 'expected_counts' => $this->counts()]);
        $history = CashBox::factory()->count(27)->create(['branch_id' => $branch->id, 'user_id' => $collector->id, 'status' => 'received', 'open_key' => null, 'closed_at' => now(), 'confirmed_at' => now(), 'collector_counts' => $this->counts(), 'expected_counts' => $this->counts()]);
        CashBox::factory()->create(['branch_id' => $branch->id, 'user_id' => $head->id, 'status' => 'received', 'open_key' => null, 'confirmed_at' => now()]);
        $otherBranch = Branch::factory()->create();
        CashBox::factory()->create(['branch_id' => $otherBranch->id, 'user_id' => $collector->id, 'status' => 'received', 'open_key' => null, 'confirmed_at' => now()]);

        $this->actingAs($collector)->get(route('payments.summary'))->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Payments/Summary')
            ->has('needsAction', 1)->where('needsAction.0.id', $pending->id)
            ->where('needsAction.0.expectedCounts.ILS', '100')
            ->where('current.cash', null)->where('current.bank_transfer', null)->where('current.clearing', null));

        $this->get(route('payments.cash-boxes'))->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Payments/CashBoxes')
            ->where('pendingCount', 1)
            ->where('boxes.total', 28)->has('boxes.data', 15)
            ->where('boxes.data.0.id', $history->last()->id)
            ->where('collectionUrls.payments', route('payments.index'))
            ->where('collectionUrls.summary', route('payments.summary')));

        $this->get(route('payments.cash-boxes', ['page' => 2]))->assertInertia(fn (AssertableInertia $page) => $page
            ->has('boxes.data', 13)->where('boxes.data.11.id', $history->first()->id)->where('boxes.data.12.id', $pending->id));
    }

    public function test_collector_sees_the_shortfall_the_branch_recorded_as_their_debt(): void
    {
        [$branch, $head, $collector] = $this->start();
        $box = $this->payment($branch, $collector);

        $this->actingAs($head)->post(route('closings.actions', ['action' => 'receive', 'record' => $box->id]), ['branch_id' => $branch->id, 'cash_counted' => true])->assertSessionHasNoErrors();
        CollectorDebt::query()->create(['cash_box_id' => $box->id, 'branch_id' => $branch->id, 'user_id' => $collector->id, 'currency' => 'ILS', 'amount' => '40.00', 'remaining' => '40.00']);

        $this->actingAs($collector)->get(route('payments.summary'))->assertInertia(fn (AssertableInertia $page) => $page
            ->has('cashBox.debts', 1)
            ->where('cashBox.debts.0.remaining', '40.00')
            ->where('cashBox.debts.0.box.number', $box->number));
    }

    public function test_collector_answers_an_audit_note_the_branch_sent_them(): void
    {
        [$branch, $head, $collector] = $this->start();
        $box = $this->payment($branch, $collector);
        $note = AuditNote::factory()->create(['closing_id' => Closing::factory()->submitted()->create(['branch_id' => $branch->id])->id, 'cash_box_id' => $box->id, 'assigned_to' => $collector->id, 'status' => 'with_collector']);
        $note->replies()->create(['user_id' => $head->id, 'kind' => 'collector', 'body' => 'أين ذهب الفرق؟']);

        $this->actingAs($collector)->get(route('payments.summary'))->assertInertia(fn (AssertableInertia $page) => $page
            ->has('cashBox.auditNotes', 1)
            ->where('cashBox.auditNotes.0.question', 'أين ذهب الفرق؟')
            ->where('cashBox.auditNotes.0.replyUrl', route('payments.audit-notes.reply', $note)));

        $this->post(route('payments.audit-notes.reply', $note), ['body' => ''])->assertSessionHasErrors('body');
        $this->actingAs($this->collector($branch))->post(route('payments.audit-notes.reply', $note), ['body' => 'ردّ'])->assertNotFound();
        $this->assertDatabaseHas('audit_notes', ['id' => $note->id, 'status' => 'with_collector']);

        $this->actingAs($collector)->from(route('payments.summary'))->post(route('payments.audit-notes.reply', $note), ['body' => 'سلّمت الفرق نقدًا.'])
            ->assertRedirect(route('payments.summary'))->assertSessionHasNoErrors();

        $this->assertDatabaseHas('audit_notes', ['id' => $note->id, 'status' => 'collector_replied']);
        $this->assertDatabaseHas('audit_note_replies', ['audit_note_id' => $note->id, 'user_id' => $collector->id, 'kind' => 'collector_response', 'body' => 'سلّمت الفرق نقدًا.']);
        $this->post(route('payments.audit-notes.reply', $note), ['body' => 'مرة أخرى'])->assertNotFound();
    }

    public function test_boxes_are_numbered_by_id_and_a_payment_carries_its_box_number_once_the_box_closes(): void
    {
        [$branch, $head, $collector] = $this->start();
        $box = $this->payment($branch, $collector);
        $statementBox = fn (): ?string => $this->actingAs($head)->get(route('subscriptions.statement', $box->payments()->sole()->transaction->subscription_id))
            ->viewData('page')['props']['entries'][0]['cashBox'];

        $this->assertSame((string) $box->id, $box->number);
        $this->assertNull($statementBox());

        $this->post(route('closings.actions', ['action' => 'receive', 'record' => $box->id]), ['branch_id' => $branch->id, 'cash_counted' => true])->assertSessionHasNoErrors();

        $this->assertSame($box->number, $statementBox());
    }

    public function test_box_table_shows_who_closed_each_box_what_the_branch_received_and_where(): void
    {
        [$branch, $head, $collector] = $this->start();
        $received = $this->payment($branch, $collector);
        $this->actingAs($head)->post(route('closings.actions', ['action' => 'receive', 'record' => $received->id]), ['branch_id' => $branch->id, 'cash_counted' => true])->assertSessionHasNoErrors();
        $cutOff = $this->payment($branch, $collector);
        $this->travelTo($cutOff->closing->coverage_until->addMinute());

        $this->actingAs($collector)->get(route('payments.cash-boxes'))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('boxes.data.0.id', $cutOff->id)
            ->where('boxes.data.0.closedBy', 'تلقائي عند القطع الأسبوعي')
            ->where('boxes.data.0.receivedAmounts.ILS', '0.00')
            ->where('boxes.data.0.settledIn', null)
            ->where('boxes.data.1.id', $received->id)
            ->where('boxes.data.1.closedBy', $head->name)
            ->where('boxes.data.1.receivedAmounts.ILS', '100.00')
            ->where('boxes.data.1.settledIn.start', $received->closing->period_start->toDateString()));
    }

    public function test_collector_downloads_their_box_as_a_spreadsheet(): void
    {
        [$branch, $head, $collector] = $this->start();
        $box = $this->payment($branch, $collector);
        $subscriber = $box->payments()->sole()->transaction->subscription->displayName();

        $response = $this->actingAs($collector)->get(route('payments.cash-boxes.show', [$box, 'format' => 'csv']))
            ->assertDownload('cash-box-'.$box->number.'.csv');

        $this->assertStringContainsString($subscriber, $response->streamedContent());
        $this->assertStringContainsString('"رقم الصندوق",'.$box->number, $response->streamedContent());
        $this->actingAs($this->collector($branch))->get(route('payments.cash-boxes.show', [$box, 'format' => 'csv']))->assertNotFound();
    }

    public function test_summary_lists_the_entries_of_the_open_box_of_the_picked_type(): void
    {
        [$branch, $head, $collector] = $this->start();
        $cashBox = $this->payment($branch, $collector);
        $payment = $cashBox->payments()->sole()->transaction;
        $clearing = SubscriptionTransaction::recordClearing(Subscription::factory()->for($branch)->create(), $collector, '40', 'صيانة المولد');
        $clearingBox = CashBox::query()->where('user_id', $collector->id)->where('type', 'clearing')->where('status', 'open')->sole();

        $this->actingAs($collector)->get(route('payments.summary'))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('openBox.type', 'cash')
            ->has('openBox.entries.data', 1)
            ->where('openBox.entries.data.0.amount', '100.00')
            ->where('openBox.entries.data.0.receiptUrl', route('subscriptions.payments.receipt', [$payment->subscription_id, $payment->id])));

        $this->get(route('payments.summary', ['open' => 'clearing']))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('openBox.type', 'clearing')
            ->where('current.clearing.id', $clearingBox->id)
            ->where('openBox.entries.data.0.service', 'صيانة المولد')
            ->where('openBox.entries.data.0.receiptUrl', route('subscriptions.payments.receipt', [$clearing->subscription_id, $clearing->id])));

        $this->get(route('payments.summary', ['open' => 'bank_transfer']))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('openBox.type', 'bank_transfer')->where('openBox.entries', null));
    }
}
