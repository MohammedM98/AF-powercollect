<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\CashBox;
use App\Models\ClosingSetting;
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

        $this->actingAs($collector)->get(route('payments.index'))
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

        $this->actingAs($collector)->get(route('payments.index'))
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->where('cashBox.started', true)
                ->has('cashBox.boxes', 1)
                ->where('cashBox.boxes.0.id', $box->id)
                ->where('cashBox.boxes.0.paymentCount', 1)
                ->where('cashBox.boxes.0.expectedCounts', null)
                ->where('cashBox.boxes.0.urls.close', route('closings.actions', ['action' => 'close', 'record' => $box->id])));

        $this->get(route('closings.index'))->assertForbidden();
    }

    public function test_web_close_is_visible_to_mobile_and_new_payment_uses_new_box(): void
    {
        [$branch, $head, $collector] = $this->start();
        $box = $this->payment($branch, $collector);

        $this->actingAs($collector)->from(route('payments.index'))
            ->post(route('closings.actions', ['action' => 'close', 'record' => $box->id]), ['branch_id' => $branch->id, 'counts' => $this->counts()])
            ->assertRedirect(route('payments.index'))->assertSessionHasNoErrors();

        $this->assertDatabaseHas('cash_boxes', ['id' => $box->id, 'status' => 'pending', 'close_reason' => 'manual']);
        $next = $this->payment($branch, $collector);
        $this->assertNotSame($box->id, $next->id);
        $this->assertDatabaseCount('cash_box_payments', 2);
        $this->assertDatabaseHas('cash_box_payments', ['cash_box_id' => $next->id, 'amount' => '100.00']);
        $this->withToken(MobileAccessToken::issue($collector))->getJson(route('mobile.cash-boxes.index'))
            ->assertJsonPath('boxes.1.id', $box->id)->assertJsonPath('boxes.1.status', 'pending')->assertJsonPath('boxes.1.collector_counts.ILS', '100');
    }

    public function test_mobile_close_is_visible_on_the_web_and_can_be_confirmed_after_receipt(): void
    {
        [$branch, $head, $collector] = $this->start();
        $box = $this->payment($branch, $collector);
        $payload = ['branch_id' => $branch->id, 'counts' => $this->counts()];
        $this->withToken(MobileAccessToken::issue($collector))->postJson(route('mobile.cash-boxes.actions', ['action' => 'close', 'record' => $box->id]), $payload)->assertJsonPath('status', 'saved');

        $this->actingAs($collector)->get(route('payments.index'))
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->where('cashBox.boxes.1.id', $box->id)
                ->where('cashBox.boxes.1.status', 'pending')
                ->where('cashBox.boxes.1.expectedCounts.ILS', '100.00')
                ->where('cashBox.boxes.1.receivedCounts', null));

        $this->actingAs($head)->post(route('closings.actions', ['action' => 'head-count', 'record' => $box->id]), $payload)->assertSessionHasNoErrors();
        $this->post(route('closings.actions', ['action' => 'receive', 'record' => $box->id]), ['branch_id' => $branch->id, 'recounted' => true, 'decisions' => []])->assertSessionHasNoErrors();
        $this->actingAs($collector)->get(route('payments.index'))
            ->assertInertia(fn (AssertableInertia $page) => $page->where('cashBox.boxes.1.receivedCounts.ILS', '100'));
        $this->from(route('payments.index'))->post(route('closings.actions', ['action' => 'confirm', 'record' => $box->id]), ['branch_id' => $branch->id])->assertRedirect(route('payments.index'))->assertSessionHasNoErrors();

        $this->assertDatabaseHas('cash_boxes', ['id' => $box->id, 'status' => 'received', 'confirmed_at' => now()]);
    }

    public function test_automatic_cutoff_requires_collector_count_on_web_before_receipt(): void
    {
        [$branch, $head, $collector] = $this->start();
        $box = $this->payment($branch, $collector);
        $this->travelTo($box->closing->coverage_until->addMinute());

        $this->actingAs($collector)->get(route('payments.index'))
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->where('cashBox.boxes.0.status', 'pending')
                ->where('cashBox.boxes.0.collectorCounts', null)
                ->where('cashBox.boxes.0.expectedCounts', null));
        $this->post(route('closings.actions', ['action' => 'collector-count', 'record' => $box->id]), ['branch_id' => $branch->id, 'counts' => $this->counts()])->assertSessionHasNoErrors();

        $this->get(route('payments.index'))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('cashBox.boxes.0.collectorCounts.ILS', '100')
            ->where('cashBox.boxes.0.expectedCounts.ILS', '100.00'));
    }

    public function test_collector_cannot_close_another_collectors_box_or_another_branch_box(): void
    {
        [$branch, $head, $collector] = $this->start();
        $box = $this->payment($branch, $head);

        $this->actingAs($collector)->post(route('closings.actions', ['action' => 'close', 'record' => $box->id]), ['branch_id' => $branch->id, 'counts' => $this->counts()])->assertSessionHasErrors(['action' => 'لا يمكنك إغلاق هذا الصندوق.']);

        $this->assertDatabaseHas('cash_boxes', ['id' => $box->id, 'status' => 'open', 'collector_counts' => null]);
        $this->post(route('closings.actions', ['action' => 'close', 'record' => $box->id]), ['branch_id' => Branch::factory()->create()->id, 'counts' => $this->counts()])->assertNotFound();
        $this->assertDatabaseHas('cash_boxes', ['id' => $box->id, 'status' => 'open', 'collector_counts' => null]);
    }

    public function test_invalid_count_or_unexplained_difference_keeps_box_open(): void
    {
        [$branch, $head, $collector] = $this->start();
        $box = $this->payment($branch, $collector);
        $url = route('closings.actions', ['action' => 'close', 'record' => $box->id]);

        $this->actingAs($collector)->post($url, ['branch_id' => $branch->id, 'counts' => ['ILS' => -1, 'USD' => 0, 'JOD' => 0]])->assertSessionHasErrors('counts.ILS');
        $this->assertDatabaseHas('cash_boxes', ['id' => $box->id, 'status' => 'open', 'collector_counts' => null]);

        $this->post($url, ['branch_id' => $branch->id, 'counts' => ['ILS' => 90, 'USD' => 0, 'JOD' => 0]])->assertSessionHasErrors(['action' => 'اكتب سبب فرق العدّ قبل إغلاق الصندوق.']);
        $this->assertDatabaseHas('cash_boxes', ['id' => $box->id, 'status' => 'open', 'collector_counts' => null]);
    }

    public function test_cash_box_page_requires_payment_access_and_sign_in(): void
    {
        $this->get(route('payments.cash-boxes'))->assertRedirect(route('login'));
        $this->actingAs(User::factory()->dataEntry()->create())->get(route('payments.cash-boxes'))->assertForbidden();
    }

    public function test_closed_box_page_keeps_all_pending_boxes_and_paginates_only_own_completed_history(): void
    {
        [$branch, $head, $collector] = $this->start();
        $pending = CashBox::factory()->create(['branch_id' => $branch->id, 'user_id' => $collector->id, 'status' => 'pending', 'open_key' => null, 'closed_at' => now(), 'expected_counts' => $this->counts()]);
        $history = CashBox::factory()->count(17)->create(['branch_id' => $branch->id, 'user_id' => $collector->id, 'status' => 'received', 'open_key' => null, 'closed_at' => now(), 'confirmed_at' => now(), 'collector_counts' => $this->counts(), 'expected_counts' => $this->counts()]);
        CashBox::factory()->create(['branch_id' => $branch->id, 'user_id' => $head->id, 'status' => 'received', 'open_key' => null, 'confirmed_at' => now()]);
        $otherBranch = Branch::factory()->create();
        CashBox::factory()->create(['branch_id' => $otherBranch->id, 'user_id' => $collector->id, 'status' => 'received', 'open_key' => null, 'confirmed_at' => now()]);

        $this->actingAs($collector)->get(route('payments.cash-boxes'))->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Payments/CashBoxes')
            ->has('cashBox.boxes', 1)->where('cashBox.boxes.0.id', $pending->id)
            ->where('cashBox.boxes.0.expectedCounts', null)
            ->where('history.total', 17)->has('history.data', 15)
            ->where('history.data.0.id', $history->last()->id)
            ->where('collectionUrls.payments', route('payments.index')));

        $this->get(route('payments.cash-boxes', ['page' => 2]))->assertInertia(fn (AssertableInertia $page) => $page
            ->has('cashBox.boxes', 1)->has('history.data', 2)->where('history.data.1.id', $history->first()->id));
    }
}
