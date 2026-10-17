<?php

namespace Tests\Feature;

use App\Enums\PaymentMethod;
use App\Enums\PermissionKey;
use App\Enums\SubscriptionStatus;
use App\Models\Branch;
use App\Models\CircuitBreaker;
use App\Models\Governorate;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Support\DailySeries;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_sees_stats_across_all_branches(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $branchA = Branch::factory()->create(['is_active' => true]);
        $branchB = Branch::factory()->create(['is_active' => false]);
        User::factory()->collector()->create(['branch_id' => $branchA->id, 'name' => 'Alpha Collector']);
        User::factory()->collector()->create(['branch_id' => $branchB->id, 'name' => 'Beta Collector']);

        $response = $this->actingAs($superAdmin)->get(route('dashboard'));

        $response->assertOk();
        $response->assertSee('Alpha Collector');
        $response->assertSee('Beta Collector');
        // Rendered via Inertia now: branch names sit inside the raw JSON
        // page payload, not HTML-escaped Blade output — compare unescaped.
        $response->assertSee($branchA->name, false);
        $response->assertSee($branchB->name, false);
    }

    public function test_branch_admin_only_sees_their_own_branch_in_dashboard_stats(): void
    {
        $ownBranch = Branch::factory()->create();
        $otherBranch = Branch::factory()->create();
        $branchAdmin = User::factory()->branchAdmin()->create(['branch_id' => $ownBranch->id]);
        User::factory()->collector()->create(['branch_id' => $ownBranch->id, 'name' => 'My Branch Collector']);
        User::factory()->collector()->create(['branch_id' => $otherBranch->id, 'name' => 'Other Branch Collector']);

        $response = $this->actingAs($branchAdmin)->get(route('dashboard'));

        $response->assertOk();
        $response->assertSee('My Branch Collector');
        $response->assertDontSee('Other Branch Collector');
        $response->assertSee($ownBranch->name, false);
        $response->assertDontSee($otherBranch->name, false);
    }

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get(route('dashboard'))
            ->assertRedirect(route('login'));
    }

    public function test_a_field_user_with_nothing_to_see_is_pointed_to_the_field_app(): void
    {
        config(['powercollect.mobile_app_url' => 'https://example.test/app.apk']);
        $collector = User::factory()->collector()->withPermissions([PermissionKey::RecordCollections])->create();

        $this->actingAs($collector)->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->where('sections', [])
            ->where('fieldApp.url', 'https://example.test/app.apk'));

        config(['powercollect.mobile_app_url' => null]);
        $this->get(route('dashboard'))->assertInertia(fn ($page) => $page->where('fieldApp.url', null));
    }

    public function test_the_field_app_notice_is_only_for_field_users_who_have_nothing_else_to_see(): void
    {
        $nothing = User::factory()->collector()->create();
        $nothing->permissions()->sync([]);
        $this->actingAs($nothing)->get(route('dashboard'))->assertInertia(fn ($page) => $page->where('fieldApp', null));

        $branchAdmin = User::factory()->branchAdmin()->withPermissions([PermissionKey::RecordCollections])->create();
        $this->actingAs($branchAdmin)->get(route('dashboard'))->assertInertia(fn ($page) => $page->where('fieldApp', null));
    }

    public function test_the_new_branch_pop_up_loads_its_options_only_when_opened(): void
    {
        Governorate::factory()->create(['name' => 'Baghdad']);
        $superAdmin = User::factory()->superAdmin()->create();

        $response = $this->actingAs($superAdmin)->get(route('dashboard'));

        $response->assertInertia(fn ($page) => $page
            ->where('canCreateBranch', true)
            ->missing('branchForm')
            ->reloadOnly('branchForm', fn ($reload) => $reload->where('branchForm.governorates.0.name', 'Baghdad')));
    }

    public function test_the_new_user_pop_up_offers_a_branch_admin_only_staff_roles_in_their_branch(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();

        $response = $this->actingAs($branchAdmin)->get(route('dashboard'));

        $response->assertInertia(fn ($page) => $page
            ->missing('userForm')
            ->reloadOnly('userForm', fn ($reload) => $reload
                ->where('userForm.canChooseBranch', false)
                ->where('userForm.roleOptions', fn ($options): bool => collect($options)->pluck('value')->all() === ['collector', 'data_entry', 'accountant', 'financial_auditor'])));
    }

    public function test_someone_who_cannot_create_branches_gets_no_branch_pop_up_options(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();

        $response = $this->actingAs($branchAdmin)->get(route('dashboard'));

        $response->assertInertia(fn ($page) => $page->reloadOnly('branchForm', fn ($reload) => $reload->where('branchForm', null)));
    }

    public function test_the_collection_figures_count_the_payments_taken_in_the_actors_branch(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-17 12:00:00', config('app.business_timezone')));
        [$ownBranch, $otherBranch] = Branch::factory()->count(2)->create();
        $branchAdmin = User::factory()->branchAdmin()->for($ownBranch)->create();
        $collector = User::factory()->collector()->for($ownBranch)->create();
        $own = Subscription::factory()->for($ownBranch)->create(['circuit_breaker_id' => null]);
        $other = Subscription::factory()->for($otherBranch)->create(['circuit_breaker_id' => null]);

        $this->payment($own, $collector, '100', 0);
        $this->payment($own, $collector, '40', 0, ['payment_method' => PaymentMethod::BankTransfer]);
        $this->payment($own, $collector, '999', 0, ['cancelled_at' => now()]);
        $this->payment($other, $collector, '500', 0);
        $this->payment($own, $collector, '60', 1);
        $this->payment($own, $collector, '30', 3);
        $this->payment($own, $collector, '20', 10);
        $this->payment($own, $collector, '5', 16);
        $this->payment($own, $collector, '7', 27);
        SubscriptionTransaction::factory()->for($own)->create(['type' => 'penalty', 'source_key' => 'penalty:'.Str::ulid(), 'amount' => '80.00']);

        $this->actingAs($branchAdmin)->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->where('sections.collections.today', ['total' => 140, 'payments' => 2])
            ->where('sections.collections.yesterday', ['total' => 60, 'payments' => 1])
            ->where('sections.collections.week', ['total' => 90, 'payments' => 2])
            ->where('sections.collections.previousWeek', ['total' => 20, 'payments' => 1])
            ->where('sections.collections.month', ['total' => 255, 'payments' => 6])
            ->where('sections.collections.lastMonth', ['total' => 7, 'payments' => 1])
            ->where('sections.collections.methods', ['cash' => 222, 'transfers' => 40])
            ->has('sections.collections.daily', 30)
            ->where('sections.collections.daily.29', ['date' => '2026-10-17', 'value' => 140, 'count' => 2])
            ->where('sections.collections.collectors', [['id' => $collector->id, 'name' => $collector->name, 'branch' => $ownBranch->name, 'total' => 262, 'payments' => 7]])
            ->where('sections.collections.branches', null)
            ->where('branchFilter', null));
    }

    public function test_a_super_admin_ranks_the_branches_and_can_narrow_the_figures_to_one(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-17 12:00:00', config('app.business_timezone')));
        $superAdmin = User::factory()->superAdmin()->create();
        $quiet = Branch::factory()->create(['name' => 'Quiet']);
        $small = Branch::factory()->create(['name' => 'Small']);
        $busy = Branch::factory()->create(['name' => 'Busy']);
        $collector = User::factory()->collector()->for($small)->create();
        $this->payment(Subscription::factory()->for($small)->create(['circuit_breaker_id' => null]), $collector, '100', 0);
        $this->payment(Subscription::factory()->for($busy)->create(['circuit_breaker_id' => null]), $collector, '300', 0);

        $this->actingAs($superAdmin)->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->where('sections.collections.today.total', 400)
            ->where('sections.collections.branches.0', fn ($branch): bool => $branch['name'] === 'Busy' && $branch['total'] == 300)
            ->where('sections.collections.branches.1', fn ($branch): bool => $branch['name'] === 'Small' && $branch['total'] == 100)
            ->where('sections.collections.branches', fn ($branches): bool => collect($branches)->firstWhere('name', 'Quiet')['total'] == 0)
            ->where('branchFilter.selected', null)
            ->has('branchFilter.options', Branch::count()));

        $this->get(route('dashboard', ['branch' => $small->id]))->assertInertia(fn ($page) => $page
            ->where('sections.collections.today.total', 100)
            ->where('sections.collections.branches', null)
            ->where('sections.subscriptions.total', 1)
            ->where('branchFilter.selected', $small->id));

        $this->get(route('dashboard', ['branch' => 'nope']))->assertInertia(fn ($page) => $page
            ->where('sections.collections.today.total', 400)
            ->where('branchFilter.selected', null));
    }

    public function test_the_branch_filter_cannot_take_branch_staff_out_of_their_own_branch(): void
    {
        [$ownBranch, $otherBranch] = Branch::factory()->count(2)->create();
        $branchAdmin = User::factory()->branchAdmin()->for($ownBranch)->create();
        $collector = User::factory()->collector()->for($otherBranch)->create();
        $this->payment(Subscription::factory()->for($otherBranch)->create(['circuit_breaker_id' => null]), $collector, '300', 0);

        $this->actingAs($branchAdmin)->get(route('dashboard', ['branch' => $otherBranch->id]))->assertInertia(fn ($page) => $page
            ->where('sections.collections.today.total', 0)
            ->where('sections.subscriptions.total', 0)
            ->where('branchFilter', null));
    }

    public function test_the_collection_figures_are_only_for_those_who_may_view_collections(): void
    {
        $dataEntry = User::factory()->dataEntry()->create();

        $this->actingAs($dataEntry)->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->has('sections.subscriptions')
            ->missing('sections.collections'));
    }

    public function test_the_breaker_sizes_most_used_by_the_branchs_active_subscriptions_are_listed(): void
    {
        [$ownBranch, $otherBranch] = Branch::factory()->count(2)->create();
        $branchAdmin = User::factory()->branchAdmin()->for($ownBranch)->create();
        $ten = CircuitBreaker::factory()->create(['ampere' => 10]);
        $twenty = CircuitBreaker::factory()->create(['ampere' => 20]);
        Subscription::factory()->for($ownBranch)->count(2)->create(['circuit_breaker_id' => $ten->id]);
        Subscription::factory()->for($ownBranch)->create(['circuit_breaker_id' => $twenty->id]);
        Subscription::factory()->for($ownBranch)->create(['circuit_breaker_id' => $twenty->id, 'status' => SubscriptionStatus::Suspended]);
        Subscription::factory()->for($otherBranch)->count(3)->create(['circuit_breaker_id' => $twenty->id]);

        $this->actingAs($branchAdmin)->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->where('sections.circuitBreakers', ['total' => 2, 'usage' => [['ampere' => 10, 'subscriptions' => 2], ['ampere' => 20, 'subscriptions' => 1]]]));
    }

    /**
     * A payment `$amount` shekels `$daysAgo` days before today (business
     * time), an hour into that day.
     *
     * @param  array<string, mixed>  $extra
     */
    private function payment(Subscription $subscription, User $collector, string $amount, int $daysAgo, array $extra = []): SubscriptionTransaction
    {
        return SubscriptionTransaction::factory()->for($subscription)->create([
            'recorded_by' => $collector->id,
            'type' => SubscriptionTransaction::TYPE_PAYMENT,
            'source_key' => 'payment:'.Str::ulid(),
            'amount' => '-'.$amount,
            'currency_amount' => $amount,
            'payment_method' => PaymentMethod::Cash,
            'created_at' => DailySeries::startOfDay($daysAgo)->addHour(),
            ...$extra,
        ]);
    }
}
