<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Permission;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class PaymentsPageTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;

    private User $collector;

    protected function setUp(): void
    {
        parent::setUp();

        $this->branch = Branch::factory()->create();
        $this->collector = $this->userAllowedTo(PermissionKey::RecordCollections);
    }

    public function test_the_page_needs_a_signed_in_user_who_may_record_payments(): void
    {
        $this->get(route('payments.index'))->assertRedirect(route('login'));

        $this->actingAs(User::factory()->dataEntry()->create(['branch_id' => $this->branch->id]))
            ->get(route('payments.index'))
            ->assertForbidden();

        $this->actingAs($this->collector)->get(route('payments.index'))->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page->component('Payments/Index')->where('can.recordPayments', true));
    }

    public function test_nothing_is_listed_until_the_user_searches(): void
    {
        Subscription::factory()->create(['branch_id' => $this->branch->id]);

        $this->actingAs($this->collector)->get(route('payments.index'))
            ->assertInertia(fn (AssertableInertia $page) => $page->has('subscriptions', 0));
    }

    public function test_a_search_finds_subscriptions_of_the_users_branch_by_name_account_number_or_phone(): void
    {
        $subscription = Subscription::factory()->create(['branch_id' => $this->branch->id, 'full_name' => 'Mohammed Hamdan', 'phone' => '0591234567']);
        Subscription::factory()->create(['branch_id' => $this->branch->id, 'full_name' => 'Somebody Else', 'phone' => '0569999999']);

        foreach (['Hamdan', $subscription->account_number, '059 123 4567'] as $search) {
            $this->actingAs($this->collector)->get(route('payments.index', ['search' => $search]))
                ->assertInertia(fn (AssertableInertia $page) => $page
                    ->where('search', $search)
                    ->has('subscriptions', 1)
                    ->where('subscriptions.0.id', $subscription->id)
                    ->where('subscriptions.0.fullName', 'Mohammed Hamdan')
                    ->where('subscriptions.0.accountNumber', $subscription->account_number));
        }
    }

    public function test_a_search_never_finds_a_subscription_of_another_branch_unless_the_user_is_the_super_admin(): void
    {
        $other = Subscription::factory()->create(['branch_id' => Branch::factory()->create()->id, 'full_name' => 'Faraway Customer']);

        $this->actingAs($this->collector)->get(route('payments.index', ['search' => 'Faraway']))
            ->assertInertia(fn (AssertableInertia $page) => $page->has('subscriptions', 0));

        $this->actingAs(User::factory()->superAdmin()->create())->get(route('payments.index', ['search' => 'Faraway']))
            ->assertInertia(fn (AssertableInertia $page) => $page->has('subscriptions', 1)->where('subscriptions.0.id', $other->id));
    }

    public function test_a_result_carries_what_the_subscriber_owes(): void
    {
        $subscription = Subscription::factory()->create(['branch_id' => $this->branch->id, 'full_name' => 'Owing Customer', 'minimum_charge' => 15]);
        $subscription->transactions()->create(['recorded_by' => $this->collector->id, 'type' => SubscriptionTransaction::TYPE_SUBSCRIPTION_FEE, 'source_key' => 'fee:1', 'amount' => '120.00']);
        SubscriptionTransaction::recordPayment($subscription, $this->collector, ['amount' => '20', 'currency' => 'ILS', 'payment_method' => 'cash']);

        $this->actingAs($this->collector)->get(route('payments.index', ['search' => 'Owing']))
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->where('subscriptions.0.balance', '100.00')
                ->where('subscriptions.0.weeklyMinimumPayment', fn ($minimum) => (float) $minimum === 15.0));
    }

    public function test_the_day_shows_only_the_users_own_live_payments(): void
    {
        $subscription = Subscription::factory()->create(['branch_id' => $this->branch->id]);
        $cash = SubscriptionTransaction::recordPayment($subscription, $this->collector, ['amount' => '100', 'currency' => 'ILS', 'payment_method' => 'cash']);
        SubscriptionTransaction::recordPayment($subscription, $this->collector, [
            'amount' => '250.50', 'currency' => 'ILS', 'payment_method' => 'bank_transfer', 'bank_name' => 'بنك فلسطين', 'sender_name' => 'Payer', 'reference_number' => 'TR-1',
        ]);
        SubscriptionTransaction::recordPayment($subscription, $this->userAllowedTo(PermissionKey::RecordCollections), ['amount' => '999', 'currency' => 'ILS', 'payment_method' => 'cash']);
        $cancelled = SubscriptionTransaction::recordPayment($subscription, $this->collector, ['amount' => '40', 'currency' => 'ILS', 'payment_method' => 'cash']);
        $cancelled->update(['cancelled_at' => now()]);

        $this->actingAs($this->collector)->get(route('payments.index'))
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->where('today.count', 2)
                ->where('today.total', '350.50')
                ->where('today.cash', '100.00')
                ->where('today.transfers', '250.50')
                ->has('today.payments', 2)
                ->where('today.payments.1.id', $cash->id)
                ->where('today.payments.1.amount', '100')
                ->where('today.payments.0.bankName', 'بنك فلسطين'));
    }

    public function test_someone_who_may_only_record_payments_can_print_their_receipt(): void
    {
        $subscription = Subscription::factory()->create(['branch_id' => $this->branch->id]);
        $payment = SubscriptionTransaction::recordPayment($subscription, $this->collector, ['amount' => '100', 'currency' => 'ILS', 'payment_method' => 'cash']);

        $this->actingAs($this->collector)
            ->get(route('subscriptions.payments.receipt', [$subscription, $payment]))
            ->assertOk();

        $elsewhere = Subscription::factory()->create(['branch_id' => Branch::factory()->create()->id]);
        $elsewherePayment = SubscriptionTransaction::recordPayment($elsewhere, User::factory()->superAdmin()->create(), ['amount' => '10', 'currency' => 'ILS', 'payment_method' => 'cash']);

        $this->actingAs($this->collector)
            ->get(route('subscriptions.payments.receipt', [$elsewhere, $elsewherePayment]))
            ->assertForbidden();
    }

    private function userAllowedTo(PermissionKey $key): User
    {
        $user = User::factory()->collector()->create(['branch_id' => $this->branch->id]);
        $user->permissions()->syncWithoutDetaching(Permission::firstOrCreate(['key' => $key->value], ['label' => $key->label()]));

        return $user;
    }
}
