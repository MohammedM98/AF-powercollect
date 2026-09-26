<?php

namespace Tests\Feature\BranchPerformance;

use App\Enums\PermissionKey;
use App\Enums\SubscriberStatus;
use App\Models\Branch;
use App\Models\Permission;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class BranchPerformanceTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_compares_every_branch_ranked_by_the_chosen_figure(): void
    {
        $karrada = Branch::factory()->create(['name' => 'Karrada']);
        $mansour = Branch::factory()->create(['name' => 'Mansour']);
        $this->subscriberWithEntry($karrada, '200.00');
        $this->subscriberWithEntry($mansour, '50.00');
        $this->subscriberWithEntry($mansour, '50.00', SubscriberStatus::Disconnected);
        Subscriber::factory()->for($mansour)->create(['created_at' => now()->subDays(20)]);

        $this->actingAs(User::factory()->superAdmin()->create())
            ->get(route('branch-performance.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('BranchPerformance/Index')
                ->where('sort', 'revenue')
                ->where('summary.ledgerTotal', 300)
                ->where('summary.subscribers', 4)
                ->where('summary.activeSubscribers', 3)
                ->where('summary.weekEntries', 3)
                ->where('branches.0.name', 'Karrada')
                ->where('branches.0.rank', 1)
                ->where('branches.0.ledgerTotal', 200)
                ->where('branches.1.name', 'Mansour')
                ->where('branches.1.subscribers', 3)
                ->where('branches.1.activeSubscribers', 2)
                ->where('branches.1.todayEntries', 2)
                ->where('branches.1.sparkline', fn ($days) => count($days) === 14 && collect($days)->last() === 2));

        $this->actingAs(User::factory()->superAdmin()->create())
            ->get(route('branch-performance.index', ['sort' => 'subscribers']))
            ->assertInertia(fn (Assert $page) => $page->where('sort', 'subscribers')->where('branches.0.name', 'Mansour'));
    }

    public function test_branch_admin_sees_only_their_own_branch(): void
    {
        $ownBranch = Branch::factory()->create();
        $otherBranch = Branch::factory()->create();
        $branchAdmin = User::factory()->branchAdmin()->create(['branch_id' => $ownBranch->id]);

        $this->actingAs($branchAdmin)
            ->get(route('branch-performance.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->has('branches', 1)->where('branches.0.id', $ownBranch->id));

        $this->actingAs($branchAdmin)->get(route('branch-performance.show', $ownBranch))->assertOk();
        $this->actingAs($branchAdmin)->get(route('branch-performance.show', $otherBranch))->assertForbidden();
    }

    public function test_branch_details_show_the_team_latest_entries_and_daily_work(): void
    {
        $branch = Branch::factory()->create();
        $dataEntry = User::factory()->dataEntry()->create(['branch_id' => $branch->id, 'name' => 'Dejon']);
        $collector = User::factory()->collector()->create(['branch_id' => $branch->id, 'name' => 'Sharon']);
        $this->subscriberWithEntry($branch, '30.00', registeredBy: $dataEntry);
        $this->subscriberWithEntry($branch, '20.00', registeredBy: $dataEntry);
        $this->subscriberWithEntry($branch, '50.00', SubscriberStatus::Suspended, $collector);

        $this->actingAs(User::factory()->superAdmin()->create())
            ->get(route('branch-performance.show', $branch))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('BranchPerformance/Show')
                ->where('branch.id', $branch->id)
                ->where('branch.ledgerTotal', 100)
                ->where('branch.monthLedgerTotal', 100)
                ->where('branch.statusCounts', ['active' => 2, 'suspended' => 1])
                ->where('team.0.name', 'Dejon')
                ->where('team.0.entries', 2)
                ->where('team.0.recordedTotal', 50)
                ->where('team.1.name', 'Sharon')
                ->where('team.1.entries', 1)
                ->has('latestEntries', 3)
                ->where('dailyEntries', fn ($days) => count($days) === 30 && collect($days)->last()['value'] == 3)
                ->where('dailyLedger', fn ($days) => collect($days)->last()['value'] == 100)
                ->where('workLog.0', [
                    'date' => today()->toDateString(),
                    'entries' => 3,
                    'ledgerCount' => 3,
                    'ledgerTotal' => 100,
                    'topRegistrar' => 'Dejon',
                ])
                ->has('workLog', 14));
    }

    public function test_the_pages_need_the_view_collections_permission(): void
    {
        $branch = Branch::factory()->create();
        $collector = User::factory()->collector()->create(['branch_id' => $branch->id]);

        $this->actingAs($collector)->get(route('branch-performance.index'))->assertForbidden();
        $this->actingAs($collector)->get(route('branch-performance.show', $branch))->assertForbidden();

        $collector->permissions()->attach(Permission::idsFor([PermissionKey::ViewCollections]));

        $this->actingAs($collector->fresh())->get(route('branch-performance.show', $branch))->assertOk();
    }

    public function test_an_unknown_branch_is_not_found(): void
    {
        $this->actingAs(User::factory()->superAdmin()->create())
            ->get(route('branch-performance.show', 999))
            ->assertNotFound();
    }

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get(route('branch-performance.index'))->assertRedirect(route('login'));
    }

    /**
     * A subscriber registered today in the branch, with one ledger entry.
     */
    private function subscriberWithEntry(
        Branch $branch,
        string $amount,
        SubscriberStatus $status = SubscriberStatus::Active,
        ?User $registeredBy = null,
    ): Subscriber {
        $registeredBy ??= User::factory()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->for($branch)->create(['status' => $status, 'registered_by' => $registeredBy->id]);
        SubscriberTransaction::factory()->for($subscriber)->create(['amount' => $amount]);

        return $subscriber;
    }
}
