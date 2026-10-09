<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\ClosingPeriod;
use App\Models\FinancialAuditStatement;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Notifications\AuditStatementSubmitted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * The financial auditors work for the whole company: they are filed under the
 * main branch, see and audit every branch's collections and closings, and are
 * the only ones who do. What they may do comes from permissions only the
 * company grants, never from the branch they are filed under.
 */
class FinancialAuditorCompanyWideTest extends TestCase
{
    use RefreshDatabase;

    private Branch $main;

    private Branch $north;

    private Branch $south;

    private User $auditor;

    private User $northSender;

    private User $southSender;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.business_timezone' => 'Asia/Hebron']);
        $this->travelTo(Carbon::parse('2026-09-28 09:00', 'Asia/Hebron'));

        $this->main = Branch::factory()->create(['name' => 'الفرع الرئيسي']);
        $this->north = Branch::factory()->create(['name' => 'فرع الشمال']);
        $this->south = Branch::factory()->create(['name' => 'فرع الجنوب']);
        $this->auditor = User::factory()->financialAuditor()->create(['branch_id' => $this->main->id]);
        $this->northSender = $this->branchWithPayment($this->north);
        $this->southSender = $this->branchWithPayment($this->south);

        // The day is over, so each branch can send its statement.
        $this->travelTo(Carbon::parse('2026-10-05 10:00', 'Asia/Hebron'));
    }

    public function test_an_auditor_filed_under_the_main_branch_reports_on_every_branch(): void
    {
        $reports = $this->actingAs($this->auditor)->get(route('reports.index'));

        // Every branch there is, not only the one the account is filed under.
        $allBranches = Branch::query()->pluck('name')->sort()->values()->all();
        $reports->assertOk()->assertInertia(fn ($page) => $page
            ->where('branches', fn ($branches): bool => collect($branches)->pluck('label')->sort()->values()->all() === $allBranches));

        $this->get(route('reports.index', ['branch' => $this->north->id, 'from' => '2026-09-28', 'to' => '2026-09-28']))
            ->assertInertia(fn ($page) => $page->where('scopeLabel', 'فرع الشمال')->where('collections.total', '100.00'));
        $this->get(route('reports.index', ['branch' => 'all', 'from' => '2026-09-28', 'to' => '2026-09-28']))
            ->assertInertia(fn ($page) => $page->where('scopeLabel', 'كل الفروع')->where('collections.total', '200.00'));
    }

    public function test_an_auditor_opens_any_branchs_closing(): void
    {
        $this->actingAs($this->auditor)->get(route('closings.index', ['tab' => 'daily', 'branch' => $this->south->id, 'date' => '2026-09-28']))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->has('branches', Branch::count())->where('branchId', $this->south->id)->where('daily.branchName', 'فرع الجنوب'));
    }

    public function test_an_auditor_receives_every_branchs_statement_and_signs_it_off(): void
    {
        $north = $this->submit($this->north, $this->northSender);
        $south = $this->submit($this->south, $this->southSender);

        $this->actingAs($this->auditor)->get(route('financial-audit.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->has('statements.data', 2)->has('branches', Branch::count()));

        foreach ([$north, $south] as $statement) {
            $this->get(route('financial-audit.show', $statement))->assertOk()->assertInertia(fn ($page) => $page->where('canReview', true));
            $this->put(route('financial-audit.review', [$statement, $statement->lines()->sole()]), ['action' => 'confirm'])->assertSessionHasNoErrors();
            $this->post(route('financial-audit.approve', $statement))->assertSessionHasNoErrors();

            $this->assertSame('audited', $statement->fresh()->status);
            $this->assertSame($this->auditor->id, $statement->fresh()->reviewed_by);
        }
    }

    public function test_the_auditors_waiting_counts_and_links_cover_the_whole_company(): void
    {
        $this->submit($this->north, $this->northSender);
        $this->submit($this->south, $this->southSender);

        $this->actingAs($this->auditor)->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->where('attention', fn ($items): bool => collect($items)->pluck('count', 'key')->all() === ['closings' => 0, 'audit' => 2])
            ->where('can.viewFinancialAudit', true)
            ->where('can.viewClosings', true));
    }

    public function test_only_auditors_audit_branch_staff_see_and_review_their_own_branch_only(): void
    {
        $northStatement = $this->submit($this->north, $this->northSender);
        $southStatement = $this->submit($this->south, $this->southSender);
        $northAdmin = User::factory()->branchAdmin()->create(['branch_id' => $this->north->id]);

        $this->actingAs($northAdmin)->get(route('financial-audit.index'))->assertForbidden();
        $this->get(route('financial-audit.show', $southStatement))->assertNotFound();
        $this->put(route('financial-audit.review', [$northStatement, $northStatement->lines()->sole()]), ['action' => 'confirm'])->assertForbidden();
        $this->post(route('financial-audit.approve', $northStatement))->assertForbidden();
        $this->assertSame('pending', $northStatement->fresh()->status);

        $this->get(route('reports.index'))->assertInertia(fn ($page) => $page->has('branches', 1)->where('branches.0.label', 'فرع الشمال'));
        $this->get(route('closings.index', ['branch' => $this->south->id]))
            ->assertInertia(fn ($page) => $page->has('branches', 1)->where('branches.0.label', 'فرع الشمال'));
    }

    public function test_an_auditor_added_by_a_branch_admin_gets_none_of_the_audit_powers(): void
    {
        $northAdmin = User::factory()->branchAdmin()->create(['branch_id' => $this->north->id]);

        $this->actingAs($northAdmin)->post(route('users.store'), [
            'name' => 'Branch Made Auditor', 'username' => 'branch.made', 'password' => 'Tulip2026ab', 'password_confirmation' => 'Tulip2026ab',
            'role' => UserRole::FinancialAuditor->value,
        ])->assertSessionHasNoErrors();

        $made = User::where('username', 'branch.made')->sole();

        foreach ([PermissionKey::AuditClosings, PermissionKey::ViewAllClosings, PermissionKey::MarkClosingsAudited] as $permission) {
            $this->assertFalse($made->hasPermission($permission), $permission->value);
        }
    }

    public function test_a_super_admin_files_an_auditor_under_the_main_branch_with_the_full_audit_set(): void
    {
        $this->actingAs(User::factory()->superAdmin()->create())->post(route('users.store'), [
            'name' => 'Central Auditor', 'username' => 'central.auditor', 'password' => 'Tulip2026ab', 'password_confirmation' => 'Tulip2026ab',
            'role' => UserRole::FinancialAuditor->value, 'branch_id' => $this->main->id,
        ])->assertSessionHasNoErrors();

        $central = User::where('username', 'central.auditor')->sole();

        $this->assertSame($this->main->id, $central->branch_id);
        $this->assertEqualsCanonicalizing(
            [PermissionKey::ViewAllClosings->value, PermissionKey::AuditClosings->value, PermissionKey::MarkClosingsAudited->value, PermissionKey::ExportFinancialReports->value],
            $central->permissions()->pluck('key')->all(),
        );
    }

    public function test_a_new_auditor_can_sign_off_the_weekly_audit_and_a_branch_accountant_cannot(): void
    {
        $period = ClosingPeriod::factory()->create();
        $signOff = ['action' => 'mark_audited', 'counted_cash' => '0', 'verified_bank' => '0', 'verified_wallets' => '0', 'verified_other' => '0'];

        // Allowed to try: the period is not under audit, so it answers with a reason rather than refusing.
        $this->actingAs($this->auditor)->put(route('closing-periods.audit', $period), $signOff)->assertSessionHasErrors('period');
        $this->actingAs($this->northSender)->put(route('closing-periods.audit', $period), $signOff)->assertForbidden();
    }

    public function test_the_auditors_are_told_when_a_branch_sends_a_statement(): void
    {
        $inactive = User::factory()->financialAuditor()->create(['branch_id' => $this->main->id, 'is_active' => false]);
        $bystander = User::factory()->branchAdmin()->create(['branch_id' => $this->north->id]);
        $secondAuditor = User::factory()->financialAuditor()->create(['branch_id' => $this->main->id]);

        $this->submit($this->north, $this->northSender);

        foreach ([$this->auditor, $secondAuditor] as $auditor) {
            $this->assertCount(1, $auditor->notifications);
            $this->assertSame('audit-statement-submitted', $auditor->notifications->first()->data['action']);
            $this->assertSame('فرع الشمال — كشف يومي 28/09/2026', $auditor->notifications->first()->data['subject']);
        }

        // Not the sender, not someone who may not audit, not an account that is switched off.
        $this->assertCount(0, $this->northSender->notifications);
        $this->assertCount(0, $bystander->notifications);
        $this->assertCount(0, $inactive->notifications);
    }

    public function test_a_failed_or_repeated_submission_tells_nobody(): void
    {
        $this->submit($this->north, $this->northSender);
        $this->assertCount(1, $this->auditor->notifications);

        // The same branch and day again: refused, so no second notice.
        $this->actingAs($this->northSender)->post(route('financial-audit.store'), ['branch_id' => $this->north->id, 'type' => 'daily', 'date' => '2026-09-28'])
            ->assertSessionHasErrors('audit');

        $this->assertCount(1, $this->auditor->fresh()->notifications);
        $this->assertSame(1, FinancialAuditStatement::query()->where('branch_id', $this->north->id)->count());
    }

    public function test_a_period_statement_names_both_ends_of_its_dates(): void
    {
        $notification = new AuditStatementSubmitted('فرع الشمال', 'أسبوعي', '27/09/2026 – 03/10/2026');

        $this->assertSame(['action' => 'audit-statement-submitted', 'subject' => 'فرع الشمال — كشف أسبوعي 27/09/2026 – 03/10/2026'], $notification->toArray($this->auditor));
        $this->assertSame(['database'], $notification->via($this->auditor));
    }

    public function test_the_sidebar_names_the_scope_of_an_account_that_works_for_every_branch(): void
    {
        $this->actingAs($this->auditor)->get(route('dashboard'))->assertInertia(fn ($page) => $page
            ->where('auth.user.scopeLabel', 'كل الفروع')
            ->where('auth.user.branchName', 'الفرع الرئيسي'));

        $northAdmin = User::factory()->branchAdmin()->create(['branch_id' => $this->north->id]);
        $this->actingAs($northAdmin)->get(route('dashboard'))->assertInertia(fn ($page) => $page->where('auth.user.scopeLabel', null)->where('auth.user.branchName', 'فرع الشمال'));
        $this->actingAs(User::factory()->superAdmin()->create())->get(route('dashboard'))->assertInertia(fn ($page) => $page->where('auth.user.scopeLabel', null));
    }

    /** A branch with a day's cash payment, its approved closing, and the accountant who prepared it. */
    private function branchWithPayment(Branch $branch): User
    {
        $sender = User::factory()->accountant()->create(['branch_id' => $branch->id]);
        $subscription = Subscription::factory()->create(['branch_id' => $branch->id]);
        SubscriptionTransaction::recordPayment($subscription, $sender, ['amount' => '100.00', 'currency' => 'ILS', 'payment_method' => 'cash']);
        Closing::factory()->approved()->forDay('2026-09-28')->create(['branch_id' => $branch->id, 'prepared_by' => $sender->id, 'counted_cash' => '100.00']);

        return $sender;
    }

    private function submit(Branch $branch, User $sender): FinancialAuditStatement
    {
        $this->actingAs($sender)->post(route('financial-audit.store'), ['branch_id' => $branch->id, 'type' => 'daily', 'date' => '2026-09-28'])->assertSessionHasNoErrors();

        return FinancialAuditStatement::query()->where('branch_id', $branch->id)->where('type', 'daily')->sole();
    }
}
