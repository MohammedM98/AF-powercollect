<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\CashBox;
use App\Models\CircuitBreaker;
use App\Models\MeterBox;
use App\Models\Permission;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\Tariff;
use App\Models\User;
use App\Support\BranchClosingWorkflow;
use Database\Seeders\CampTwoCollectorSeeder;
use Database\Seeders\CampTwoDemoDataSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use RuntimeException;
use Tests\TestCase;

class CampTwoDemoDataSeederTest extends TestCase
{
    use RefreshDatabase;

    private function prepare(): array
    {
        $this->travelTo(now()->setDate(2026, 10, 11)->setTime(10, 0));
        $branch = Branch::factory()->create(['name' => 'مخيم 2']);
        $head = User::factory()->branchAdmin()->for($branch)->create();
        $collector = User::factory()->collector()->for($branch)->create(['username' => CampTwoCollectorSeeder::USERNAME]);
        $collector->permissions()->sync(Permission::idsFor([PermissionKey::RecordCollections]));
        MeterBox::factory()->create(['branch_id' => $branch->id]);
        CircuitBreaker::factory()->create();
        Tariff::factory()->residential()->create();
        app(BranchClosingWorkflow::class)->start($branch->id, $head);

        return [$branch, $collector];
    }

    public function test_demo_data_contains_multiple_statuses_payments_and_real_cash_box_stages(): void
    {
        [$branch, $collector] = $this->prepare();

        $this->seed(CampTwoDemoDataSeeder::class);

        $this->assertDatabaseCount('subscriptions', 6);
        $this->assertDatabaseCount('subscription_transactions', 15);
        $this->assertDatabaseCount('cash_boxes', 4);
        $this->assertDatabaseCount('cash_box_payments', 9);
        $this->assertDatabaseHas('subscriptions', ['branch_id' => $branch->id, 'status' => 'active', 'notes' => CampTwoDemoDataSeeder::MARKER]);
        $this->assertDatabaseHas('subscriptions', ['branch_id' => $branch->id, 'status' => 'suspended', 'activated_at' => null]);
        $this->assertDatabaseHas('subscriptions', ['branch_id' => $branch->id, 'status' => 'disconnected']);
        $boxes = CashBox::query()->where('user_id', $collector->id)->orderBy('id')->get();
        $this->assertSame(['received', 'received', 'pending', 'open'], $boxes->pluck('status')->all());
        $this->assertNotNull($boxes[0]->confirmed_at);
        $this->assertNull($boxes[1]->confirmed_at);
        $this->assertSame(['ILS' => '150.00', 'USD' => '20.00', 'JOD' => '5.00'], $boxes[0]->expected_counts);
        $this->actingAs($collector)->get(route('payments.cash-boxes'))->assertInertia(fn (AssertableInertia $page) => $page
            ->has('cashBox.boxes', 3)->has('history.data', 1)->where('history.data.0.id', $boxes[0]->id));
        $this->get(route('payments.index'))->assertInertia(fn (AssertableInertia $page) => $page->has('subscriptions.data', 6)->where('today.count', 9));
    }

    public function test_repeated_demo_seed_does_not_duplicate_data_or_change_other_branches(): void
    {
        [$branch, $collector] = $this->prepare();
        $other = Subscription::factory()->create(['notes' => 'Existing subscription']);
        $this->seed(CampTwoDemoDataSeeder::class);
        $firstIds = SubscriptionTransaction::query()->pluck('id')->all();

        $this->seed(CampTwoDemoDataSeeder::class);

        $this->assertDatabaseCount('subscriptions', 7);
        $this->assertDatabaseCount('cash_boxes', 4);
        $this->assertSame($firstIds, SubscriptionTransaction::query()->pluck('id')->all());
        $this->assertDatabaseHas('subscriptions', ['id' => $other->id, 'branch_id' => $other->branch_id, 'status' => $other->status->value, 'notes' => 'Existing subscription']);
    }

    public function test_seeder_does_not_close_an_existing_collectors_cash_box(): void
    {
        [$branch, $collector] = $this->prepare();
        $subscription = Subscription::factory()->create(['branch_id' => $branch->id]);
        SubscriptionTransaction::recordPayment($subscription, $collector, ['amount' => '25', 'currency' => 'ILS', 'payment_method' => 'cash']);
        $box = CashBox::query()->sole();

        try {
            $this->seed(CampTwoDemoDataSeeder::class);
            $this->fail('An existing collector box must not be closed.');
        } catch (RuntimeException $exception) {
            $this->assertSame('The demo collector already has payments; no existing cash box will be closed by this seeder.', $exception->getMessage());
        }

        $this->assertDatabaseCount('subscriptions', 1);
        $this->assertDatabaseCount('subscription_transactions', 1);
        $this->assertDatabaseHas('cash_boxes', ['id' => $box->id, 'status' => 'open']);
    }
}
