<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\FinancialAuditStatement;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class DashboardMoneyTest extends TestCase
{
    use RefreshDatabase;

    private Branch $ownBranch;

    private Branch $otherBranch;

    protected function setUp(): void
    {
        parent::setUp();

        // 15:00 on Sunday 20 September in Gaza, the business's time zone.
        $this->travelTo('2026-09-20 12:00:00');

        $this->ownBranch = Branch::factory()->create();
        $this->otherBranch = Branch::factory()->create();
    }

    public function test_a_branch_admin_sees_what_their_branch_collected_charged_and_is_owed(): void
    {
        $this->seedOwnBranchMoney();

        $this->actingAs($this->branchAdmin())->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->where('money.collected', ['today' => 80, 'week' => 80, 'month' => 100])
            ->where('money.charged', ['month' => 200])
            ->where('money.openingDebt', 140)
            ->where('money.collectionRate', 29)
            ->where('money.outstanding', [
                'total' => 240,
                'debtors' => 3,
                'overNinety' => 40,
                'overNinetyShare' => 17,
            ])
            ->where('money.since', ['week' => '2026-09-19', 'month' => '2026-09-01']));
    }

    public function test_another_branchs_money_is_never_counted_for_a_branch_admin(): void
    {
        $this->seedOwnBranchMoney();
        $stranger = $this->subscriptionIn($this->otherBranch);
        $this->line($stranger, 'meter_reading', '900.00', '2026-09-03 08:00:00');
        $this->line($stranger, 'payment', '-500.00', '2026-09-20 09:00:00');

        $this->actingAs($this->branchAdmin())->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->where('money.collected.today', 80)
            ->where('money.charged.month', 200)
            ->where('money.outstanding.debtors', 3));
    }

    public function test_the_super_admin_sees_the_money_of_every_branch(): void
    {
        $this->seedOwnBranchMoney();
        $stranger = $this->subscriptionIn($this->otherBranch);
        $this->line($stranger, 'meter_reading', '300.00', '2026-09-03 08:00:00');
        $this->line($stranger, 'payment', '-120.00', '2026-09-20 09:00:00');

        $this->actingAs(User::factory()->superAdmin()->create())->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->where('money.collected', ['today' => 200, 'week' => 200, 'month' => 220])
            ->where('money.charged.month', 500)
            ->where('money.outstanding.debtors', 4));
    }

    public function test_a_cancelled_payment_is_not_counted_as_collected(): void
    {
        $subscription = $this->subscriptionIn($this->ownBranch);
        $this->line($subscription, 'meter_reading', '100.00', '2026-09-03 08:00:00');
        $this->line($subscription, 'payment', '-30.00', '2026-09-20 09:00:00');
        $this->line($subscription, 'payment', '-50.00', '2026-09-20 10:00:00')
            ->forceFill(['cancelled_at' => '2026-09-20 10:30:00'])
            ->save();

        $this->actingAs($this->branchAdmin())->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->where('money.collected.today', 30));
    }

    public function test_a_payment_after_the_cut_off_belongs_to_the_next_business_day(): void
    {
        $subscription = $this->subscriptionIn($this->ownBranch);
        $this->line($subscription, 'meter_reading', '100.00', '2026-09-03 08:00:00');
        // 22:30 on 19 September in Gaza, still the 19th: not today's.
        $this->line($subscription, 'payment', '-40.00', '2026-09-19 19:30:00');

        $this->actingAs($this->branchAdmin())->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->where('money.collected', ['today' => 0, 'week' => 40, 'month' => 40]));
    }

    public function test_nothing_owed_or_charged_leaves_the_collection_rate_empty(): void
    {
        $this->actingAs($this->branchAdmin())->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->where('money.collected', ['today' => 0, 'week' => 0, 'month' => 0])
            ->where('money.openingDebt', 0)
            ->where('money.collectionRate', null)
            ->where('money.outstanding', ['total' => 0, 'debtors' => 0, 'overNinety' => 0, 'overNinetyShare' => 0]));
    }

    public function test_the_collection_rate_is_the_share_of_the_debt_brought_forward_and_this_months_charges_that_came_in(): void
    {
        $subscription = $this->subscriptionIn($this->ownBranch);
        $this->line($subscription, 'meter_reading', '1000.00', '2026-05-02 08:00:00');
        $this->line($subscription, 'meter_reading', '200.00', '2026-09-03 08:00:00');
        // More than this month's charges: it settles old debt too, which a rate over this month's charges alone would count as 150%.
        $this->line($subscription, 'payment', '-300.00', '2026-09-10 09:00:00');

        $this->actingAs($this->branchAdmin())->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->where('money.openingDebt', 1000)
            ->where('money.charged.month', 200)
            ->where('money.collected.month', 300)
            ->where('money.collectionRate', 25));
    }

    public function test_a_month_with_only_old_debt_still_has_a_collection_rate(): void
    {
        $subscription = $this->subscriptionIn($this->ownBranch);
        $this->line($subscription, 'meter_reading', '100.00', '2026-05-02 08:00:00');
        $this->line($subscription, 'payment', '-50.00', '2026-09-10 09:00:00');

        $this->actingAs($this->branchAdmin())->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->where('money.charged.month', 0)
            ->where('money.collectionRate', 50));
    }

    public function test_credit_and_settled_accounts_at_the_start_of_the_month_are_not_debt_brought_forward(): void
    {
        $inCredit = $this->subscriptionIn($this->ownBranch);
        $this->line($inCredit, 'payment', '-50.00', '2026-08-20 09:00:00');
        $settled = $this->subscriptionIn($this->ownBranch);
        $this->line($settled, 'meter_reading', '60.00', '2026-08-10 08:00:00');
        $this->line($settled, 'payment', '-60.00', '2026-08-15 09:00:00');
        // Paid off during the month: it was still owed when the month began.
        $paidThisMonth = $this->subscriptionIn($this->ownBranch);
        $this->line($paidThisMonth, 'meter_reading', '80.00', '2026-08-12 08:00:00');
        $this->line($paidThisMonth, 'payment', '-80.00', '2026-09-05 09:00:00');

        $this->actingAs($this->branchAdmin())->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->where('money.openingDebt', 80));
    }

    public function test_each_money_figure_follows_the_permission_of_the_page_it_comes_from(): void
    {
        $this->seedOwnBranchMoney();

        $logOnly = User::factory()->dataEntry()->withPermissions([PermissionKey::ViewCollections])->create(['branch_id' => $this->ownBranch->id]);
        $this->actingAs($logOnly)->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->where('money.collected.today', 80)
            ->where('money.outstanding', null));

        $debtsOnly = User::factory()->dataEntry()->withPermissions([PermissionKey::ViewDebtAging])->create(['branch_id' => $this->ownBranch->id]);
        $this->actingAs($debtsOnly)->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->where('money.collected', null)
            ->where('money.openingDebt', null)
            ->where('money.collectionRate', null)
            ->where('money.outstanding.debtors', 3));

        $collector = User::factory()->collector()->create(['branch_id' => $this->ownBranch->id]);
        $this->actingAs($collector)->get(route('dashboard'))->assertInertia(fn ($page) => $page->where('money', null));
    }

    public function test_an_auditor_is_told_how_many_closings_and_statements_wait_for_review(): void
    {
        Closing::factory()->submitted()->forDay('2026-09-18')->create(['branch_id' => $this->ownBranch->id]);
        Closing::factory()->submitted()->forDay('2026-09-18')->create(['branch_id' => $this->otherBranch->id]);
        Closing::factory()->forDay('2026-09-17')->create(['branch_id' => $this->ownBranch->id]);
        FinancialAuditStatement::factory()->count(2)->create(['status' => 'pending']);
        FinancialAuditStatement::factory()->create(['status' => 'under_audit']);
        FinancialAuditStatement::factory()->create(['status' => 'audited']);

        $auditor = User::factory()->financialAuditor()->create(['branch_id' => $this->ownBranch->id]);

        $this->actingAs($auditor)->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->where('attention', fn ($items): bool => collect($items)->pluck('count', 'key')->all() === ['closings' => 2, 'audit' => 3])
            ->where('attention.0.href', '/closings')
            ->where('attention.1.href', '/financial-audit')
            ->where('money', null));
    }

    public function test_a_branch_admin_only_counts_their_own_branchs_closings_and_returned_statements(): void
    {
        Closing::factory()->submitted()->forDay('2026-09-18')->create(['branch_id' => $this->ownBranch->id]);
        Closing::factory()->submitted()->forDay('2026-09-18')->create(['branch_id' => $this->otherBranch->id]);
        FinancialAuditStatement::factory()->create(['status' => 'returned', 'branch_id' => $this->ownBranch->id]);
        FinancialAuditStatement::factory()->create(['status' => 'returned', 'branch_id' => $this->otherBranch->id]);
        FinancialAuditStatement::factory()->create(['status' => 'pending', 'type' => 'weekly', 'branch_id' => $this->ownBranch->id]);

        $this->actingAs($this->branchAdmin())->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->where('attention', fn ($items): bool => collect($items)->pluck('count', 'key')->all() === ['closings' => 1, 'returned' => 1]));
    }

    public function test_someone_who_may_open_none_of_those_pages_has_nothing_waiting(): void
    {
        $collector = User::factory()->collector()->create(['branch_id' => $this->ownBranch->id]);

        $this->actingAs($collector)->get(route('dashboard'))->assertInertia(fn ($page) => $page->where('attention', []));
    }

    /**
     * Two subscriptions that owe from this month's or last month's charges and
     * one from May: 240 owed in all, 40 of it over 90 days. 100 collected this
     * month (80 of it today) against 200 charged; 140 was owed when the month
     * began (100 from August, 40 from May), so 340 could be collected and the
     * rate is 29%. A subscription in credit and one settled before the month
     * began owe nothing and change none of it.
     */
    private function seedOwnBranchMoney(): void
    {
        $first = $this->subscriptionIn($this->ownBranch);
        $this->line($first, 'meter_reading', '200.00', '2026-09-02 08:00:00');
        $this->line($first, 'payment', '-80.00', '2026-09-20 09:00:00');
        $this->line($first, 'payment', '-20.00', '2026-09-02 12:00:00');

        $second = $this->subscriptionIn($this->ownBranch);
        $this->line($second, 'meter_reading', '100.00', '2026-08-25 08:00:00');

        $third = $this->subscriptionIn($this->ownBranch);
        $this->line($third, 'meter_reading', '40.00', '2026-05-01 08:00:00');

        $inCredit = $this->subscriptionIn($this->ownBranch);
        $this->line($inCredit, 'payment', '-50.00', '2026-08-20 09:00:00');

        $settled = $this->subscriptionIn($this->ownBranch);
        $this->line($settled, 'meter_reading', '60.00', '2026-08-10 08:00:00');
        $this->line($settled, 'payment', '-60.00', '2026-08-15 09:00:00');
    }

    private function branchAdmin(): User
    {
        return User::factory()->branchAdmin()->create(['branch_id' => $this->ownBranch->id]);
    }

    private function subscriptionIn(Branch $branch): Subscription
    {
        return Subscription::factory()->create(['branch_id' => $branch->id, 'meter_box_id' => null]);
    }

    private function line(Subscription $subscription, string $type, string $amount, string $at): SubscriptionTransaction
    {
        return SubscriptionTransaction::factory()->for($subscription)->create([
            'type' => $type,
            'source_key' => $type.':'.Str::ulid(),
            'amount' => $amount,
            'created_at' => $at,
        ]);
    }
}
