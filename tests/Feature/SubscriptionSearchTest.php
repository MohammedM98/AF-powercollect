<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubscriptionSearchTest extends TestCase
{
    use RefreshDatabase;

    private Branch $ownBranch;

    private Branch $otherBranch;

    protected function setUp(): void
    {
        parent::setUp();

        $this->ownBranch = Branch::factory()->create();
        $this->otherBranch = Branch::factory()->create();
    }

    public function test_guests_are_not_served(): void
    {
        $this->getJson(route('search.subscriptions', ['q' => 'Ahmad']))->assertUnauthorized();
    }

    public function test_someone_who_may_neither_list_subscriptions_nor_record_payments_is_refused(): void
    {
        $auditor = User::factory()->financialAuditor()->create(['branch_id' => $this->ownBranch->id]);

        $this->actingAs($auditor)->getJson(route('search.subscriptions', ['q' => 'Ahmad']))->assertForbidden();
    }

    public function test_a_search_finds_a_subscription_by_name_account_number_or_phone(): void
    {
        $found = $this->subscriptionIn($this->ownBranch, ['full_name' => 'Samir Haddad', 'phone' => '0599123456']);
        $this->subscriptionIn($this->ownBranch, ['full_name' => 'Someone Else', 'phone' => '0568000000']);
        $admin = $this->branchAdmin();

        foreach (['haddad', $found->account_number, '599123'] as $term) {
            $this->actingAs($admin)->getJson(route('search.subscriptions', ['q' => $term]))
                ->assertOk()
                ->assertJsonCount(1, 'results')
                ->assertJsonPath('results.0.id', $found->id)
                ->assertJsonPath('results.0.name', 'Samir Haddad')
                ->assertJsonPath('results.0.accountNumber', $found->account_number)
                ->assertJsonPath('hasMore', false);
        }
    }

    public function test_an_arabic_name_is_found_however_it_is_spelled(): void
    {
        $found = $this->subscriptionIn($this->ownBranch, ['full_name' => 'أحمد إبراهيم']);

        $this->actingAs($this->branchAdmin())->getJson(route('search.subscriptions', ['q' => 'احمد ابراهيم']))
            ->assertJsonPath('results.0.id', $found->id);
    }

    public function test_a_branch_admin_never_finds_another_branchs_subscription(): void
    {
        $this->subscriptionIn($this->ownBranch, ['full_name' => 'Nour Mine']);
        $this->subscriptionIn($this->otherBranch, ['full_name' => 'Nour Stranger']);

        $this->actingAs($this->branchAdmin())->getJson(route('search.subscriptions', ['q' => 'Nour']))
            ->assertJsonCount(1, 'results')
            ->assertJsonPath('results.0.name', 'Nour Mine');
    }

    public function test_the_super_admin_finds_subscriptions_of_every_branch(): void
    {
        $this->subscriptionIn($this->ownBranch, ['full_name' => 'Nour Mine']);
        $this->subscriptionIn($this->otherBranch, ['full_name' => 'Nour Stranger']);

        $this->actingAs(User::factory()->superAdmin()->create())->getJson(route('search.subscriptions', ['q' => 'Nour']))
            ->assertJsonCount(2, 'results');
    }

    public function test_a_result_carries_what_the_subscription_owes(): void
    {
        $subscription = $this->subscriptionIn($this->ownBranch, ['full_name' => 'Debtor Dina']);
        SubscriptionTransaction::factory()->for($subscription)->create(['type' => 'meter_reading', 'source_key' => 'reading:1', 'amount' => '120.00']);
        SubscriptionTransaction::factory()->for($subscription)->create(['type' => 'payment', 'source_key' => 'payment:1', 'amount' => '-45.50']);

        $this->actingAs($this->branchAdmin())->getJson(route('search.subscriptions', ['q' => 'Dina']))
            ->assertJsonPath('results.0.balance', '74.50');
    }

    public function test_a_search_that_is_too_short_finds_nothing(): void
    {
        $this->subscriptionIn($this->ownBranch, ['full_name' => 'Zed Short']);

        $this->actingAs($this->branchAdmin())->getJson(route('search.subscriptions', ['q' => 'Z']))
            ->assertOk()
            ->assertExactJson(['results' => [], 'hasMore' => false]);
        $this->actingAs($this->branchAdmin())->getJson(route('search.subscriptions'))
            ->assertExactJson(['results' => [], 'hasMore' => false]);
    }

    public function test_a_long_list_is_cut_and_says_there_is_more(): void
    {
        Subscription::factory()->count(9)->sequence(fn ($sequence) => ['full_name' => 'Rami Number '.$sequence->index])
            ->create(['branch_id' => $this->ownBranch->id, 'meter_box_id' => null]);

        $this->actingAs($this->branchAdmin())->getJson(route('search.subscriptions', ['q' => 'Rami']))
            ->assertJsonCount(8, 'results')
            ->assertJsonPath('hasMore', true);
    }

    public function test_a_result_leads_to_the_page_the_user_works_in(): void
    {
        $subscription = $this->subscriptionIn($this->ownBranch, ['full_name' => 'Linked Laila']);
        $collector = User::factory()->collector()->create(['branch_id' => $this->ownBranch->id]);

        $this->actingAs($this->branchAdmin())->getJson(route('search.subscriptions', ['q' => 'Laila']))
            ->assertJsonPath('results.0.href', route('subscriptions.index', ['search' => $subscription->account_number], absolute: false));

        $this->actingAs($collector)->getJson(route('search.subscriptions', ['q' => 'Laila']))
            ->assertOk()
            ->assertJsonPath('results.0.href', route('payments.index', ['search' => $subscription->account_number], absolute: false));
    }

    public function test_the_shared_permissions_say_who_may_search(): void
    {
        $this->actingAs($this->branchAdmin())->get(route('dashboard'))->assertInertia(fn ($page) => $page->where('can.searchSubscriptions', true));
        $this->actingAs(User::factory()->collector()->create(['branch_id' => $this->ownBranch->id]))->get(route('dashboard'))
            ->assertInertia(fn ($page) => $page->where('can.searchSubscriptions', true));
        $this->actingAs(User::factory()->financialAuditor()->create(['branch_id' => $this->ownBranch->id]))->get(route('dashboard'))
            ->assertInertia(fn ($page) => $page->where('can.searchSubscriptions', false));
    }

    private function branchAdmin(): User
    {
        return User::factory()->branchAdmin()->create(['branch_id' => $this->ownBranch->id]);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function subscriptionIn(Branch $branch, array $attributes = []): Subscription
    {
        return Subscription::factory()->create([...$attributes, 'branch_id' => $branch->id, 'meter_box_id' => null]);
    }
}
