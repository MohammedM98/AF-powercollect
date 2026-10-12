<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\CashBox;
use App\Models\CashBoxPayment;
use App\Models\Permission;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Support\BranchClosingWorkflow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class CloseCashBoxesPermissionTest extends TestCase
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

    private function cashBox(Branch $branch, User $collector): CashBox
    {
        $payment = SubscriptionTransaction::recordPayment(Subscription::factory()->for($branch)->create(), $collector, ['amount' => '100', 'currency' => 'ILS', 'payment_method' => 'cash']);

        return CashBoxPayment::query()->where('subscription_transaction_id', $payment->id)->sole()->box;
    }

    /** @param array<string, mixed> $data */
    private function action(User $actor, Branch $branch, string $action, int $record, array $data = []): TestResponse
    {
        return $this->actingAs($actor)->post(route('closings.actions', ['action' => $action, 'record' => $record]), ['branch_id' => $branch->id, ...$data]);
    }

    public function test_user_given_the_permission_confirms_another_collectors_box_closed(): void
    {
        [$branch, $head, $collector] = $this->start();
        $closer = User::factory()->accountant()->for($branch)->withPermissions([PermissionKey::CloseCashBoxes])->create();
        $box = $this->cashBox($branch, $collector);

        $this->actingAs($closer)->get(route('closings.index'))->assertOk();
        $this->action($closer, $branch, 'receive', $box->id)->assertSessionHasNoErrors();

        $this->assertDatabaseHas('cash_boxes', ['id' => $box->id, 'status' => 'received', 'close_reason' => 'manual', 'received_by' => $closer->id, 'confirmed_at' => now()]);
    }

    public function test_permission_does_not_let_a_collector_close_their_own_box(): void
    {
        [$branch, $head, $collector] = $this->start();
        $collector->permissions()->syncWithoutDetaching(Permission::idsFor([PermissionKey::CloseCashBoxes]));
        $own = $this->cashBox($branch, $collector);
        $other = $this->cashBox($branch, User::factory()->collector()->for($branch)->create());

        $this->action($collector, $branch, 'receive', $own->id)->assertSessionHasErrors('action');
        $this->action($collector, $branch, 'receive', $other->id)->assertSessionHasNoErrors();

        $this->assertDatabaseHas('cash_boxes', ['id' => $own->id, 'status' => 'open', 'head_counts' => null]);
        $this->assertDatabaseHas('cash_boxes', ['id' => $other->id, 'status' => 'received']);
    }

    public function test_without_the_permission_staff_cannot_close_boxes(): void
    {
        [$branch, $head, $collector] = $this->start();
        $staff = User::factory()->accountant()->for($branch)->create();
        $box = $this->cashBox($branch, $collector);

        $this->actingAs($staff)->get(route('closings.index'))->assertForbidden();
        $this->action($staff, $branch, 'receive', $box->id)->assertForbidden();

        $this->assertDatabaseHas('cash_boxes', ['id' => $box->id, 'status' => 'open']);
    }

    public function test_branch_admins_get_the_permission_and_may_grant_it(): void
    {
        $this->assertContains(PermissionKey::CloseCashBoxes, UserRole::BranchAdmin->starterPermissions());
        $this->assertFalse(PermissionKey::CloseCashBoxes->isCompanyWide());
        $this->assertFalse(PermissionKey::CloseCashBoxes->isRetired());
        $this->assertSame(PermissionKey::CloseCashBoxes, PermissionKey::resourceGroups()['collections']['actions']['close_boxes']);
    }
}
