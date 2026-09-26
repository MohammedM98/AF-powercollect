<?php

namespace Tests\Feature\FinancialLog;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Permission;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class FinancialLogTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_sees_every_branch_with_period_totals(): void
    {
        $karrada = Branch::factory()->create(['name' => 'Karrada']);
        $mansour = Branch::factory()->create(['name' => 'Mansour']);
        $this->entry($karrada, '30.00');
        $this->entry($karrada, '50.00');
        $this->entry($mansour, '100.00');

        $this->actingAs(User::factory()->superAdmin()->create())
            ->get(route('financial-log.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('FinancialLog/Index')
                ->where('scopeLabel', 'كل الفروع')
                ->has('entries.data', 3)
                ->where('summary.total', 180)
                ->where('summary.count', 3)
                ->where('summary.average', 60)
                ->where('summary.largest', 100)
                ->where('branchTotals.0.name', 'Mansour')
                ->where('branchTotals.0.total', 100)
                ->where('branchTotals.1.total', 80)
                ->where('branchTotals.1.count', 2)
                ->where('dailyTotals', fn ($days) => count($days) === 30 && collect($days)->last()['value'] == 180));
    }

    public function test_branch_admin_sees_only_their_own_branch_even_when_filtering_another(): void
    {
        $ownBranch = Branch::factory()->create();
        $otherBranch = Branch::factory()->create();
        $ownEntry = $this->entry($ownBranch, '40.00');
        $this->entry($otherBranch, '90.00');
        $branchAdmin = User::factory()->branchAdmin()->create(['branch_id' => $ownBranch->id]);

        $this->actingAs($branchAdmin)
            ->get(route('financial-log.index', ['filter' => ['branch_id' => $otherBranch->id]]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('scopeLabel', $ownBranch->name)
                ->has('entries.data', 1)
                ->where('entries.data.0.id', $ownEntry->id)
                ->where('summary.total', 40)
                ->has('branchTotals', 1));
    }

    public function test_the_period_limits_the_entries_and_compares_with_the_one_before(): void
    {
        $branch = Branch::factory()->create();
        $this->entry($branch, '75.00', now());
        $this->entry($branch, '50.00', now()->subDays(10));
        $this->entry($branch, '20.00', now()->subDays(40));

        $this->actingAs(User::factory()->superAdmin()->create())
            ->get(route('financial-log.index', ['period' => '7']))
            ->assertInertia(fn (Assert $page) => $page
                ->where('period', '7')
                ->has('entries.data', 1)
                ->where('summary.total', 75)
                ->where('summary.previousTotal', 50)
                ->where('summary.changePct', 50));

        $this->actingAs(User::factory()->superAdmin()->create())
            ->get(route('financial-log.index', ['period' => 'all']))
            ->assertInertia(fn (Assert $page) => $page
                ->has('entries.data', 3)
                ->where('summary.total', 145)
                ->where('summary.previousTotal', null));
    }

    public function test_search_matches_the_subscriber_and_each_day_keeps_its_full_total(): void
    {
        $branch = Branch::factory()->create();
        $this->entry($branch, '30.00', now(), ['full_name' => 'Ahmad Keefe']);
        $this->entry($branch, '45.00', now(), ['full_name' => 'Mona Salem']);

        $this->actingAs(User::factory()->superAdmin()->create())
            ->get(route('financial-log.index', ['search' => 'Keefe']))
            ->assertInertia(fn (Assert $page) => $page
                ->has('entries.data', 1)
                ->where('entries.data.0.subscriberName', 'Ahmad Keefe')
                ->where('dayTotals.'.today()->toDateString().'.total', 30));

        $this->actingAs(User::factory()->superAdmin()->create())
            ->get(route('financial-log.index', ['per_page' => 15]))
            ->assertInertia(fn (Assert $page) => $page->where('dayTotals.'.today()->toDateString(), ['total' => 75, 'count' => 2]));
    }

    public function test_payments_are_listed_but_kept_out_of_the_charge_totals(): void
    {
        $branch = Branch::factory()->create();
        $charge = $this->entry($branch, '80.00');
        SubscriberTransaction::factory()->for($charge->subscriber)->create([
            'type' => SubscriberTransaction::TYPE_PAYMENT,
            'source_key' => 'payment:test',
            'amount' => '-30.00',
        ]);

        $this->actingAs(User::factory()->superAdmin()->create())
            ->get(route('financial-log.index'))
            ->assertInertia(fn (Assert $page) => $page
                ->has('entries.data', 2)
                ->where('entries.data', fn ($rows) => collect($rows)->contains(fn ($row) => $row['isPayment'] && $row['typeLabel'] === 'تسديد · دفعة'))
                ->where('summary.total', 80)
                ->where('summary.count', 1)
                ->where('summary.paid', 30)
                ->where('branchTotals.0.total', 80)
                ->where('dayTotals.'.today()->toDateString(), ['total' => 80, 'count' => 1]));
    }

    public function test_viewing_the_log_needs_the_view_collections_permission(): void
    {
        $collector = User::factory()->collector()->create();

        $this->actingAs($collector)->get(route('financial-log.index'))->assertForbidden();

        $collector->permissions()->attach(Permission::idsFor([PermissionKey::ViewCollections]));

        $this->actingAs($collector->fresh())->get(route('financial-log.index'))->assertOk();
    }

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get(route('financial-log.index'))->assertRedirect(route('login'));
    }

    /**
     * One ledger entry for a new subscriber of the given branch.
     *
     * @param  array<string, mixed>  $subscriber
     */
    private function entry(Branch $branch, string $amount, ?Carbon $at = null, array $subscriber = []): SubscriberTransaction
    {
        return SubscriberTransaction::factory()
            ->for(Subscriber::factory()->for($branch)->state($subscriber))
            ->create(['amount' => $amount, 'created_at' => $at ?? now()]);
    }
}
