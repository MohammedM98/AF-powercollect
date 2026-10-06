<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\Permission;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class ClosingReportsTest extends TestCase
{
    use RefreshDatabase;

    private Branch $north;

    private Branch $south;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.business_timezone' => 'Asia/Gaza']);
        $this->travelTo(Carbon::parse('2026-10-01 10:00', 'Asia/Gaza'));
        $this->north = Branch::factory()->create(['name' => 'North']);
        $this->south = Branch::factory()->create(['name' => 'South']);
    }

    public function test_a_financial_auditor_sees_every_branchs_closings_and_reports_but_changes_nothing(): void
    {
        $auditor = $this->financialAuditor();
        $southClosing = Closing::dailyFor($this->south, '2026-09-30');
        $this->actingAs($auditor);

        $this->get(route('closings.index', ['branch' => $this->south->id, 'date' => '2026-09-30']))->assertInertia(fn ($page) => $page
            ->where('branchId', $this->south->id)
            ->where('daily.id', $southClosing->id)
            ->where('daily.can', ['prepare' => false, 'audit' => false, 'approve' => false, 'handOver' => false])
            ->where('branches', fn ($branches): bool => collect($branches)->pluck('value')->contains($this->north->id) && collect($branches)->pluck('value')->contains($this->south->id)));
        $this->get(route('closings.index', ['tab' => 'period', 'date' => '2026-09-30']))->assertInertia(fn ($page) => $page->where('periodView.canApprove', false));

        $this->put(route('closings.count', $southClosing), ['denominations' => ['200' => 1]])->assertForbidden();
        $this->post(route('closings.submit', $southClosing))->assertForbidden();
        $this->post(route('period-closings.store'), ['period' => 'weekly', 'date' => '2026-09-26'])->assertForbidden();
    }

    public function test_the_register_lists_every_branchs_closings_with_totals_and_downloads_as_csv(): void
    {
        $this->payment($this->north, '400', '2026-09-29 10:00');
        $this->payment($this->south, '250', '2026-09-30 10:00');
        $this->payment($this->south, '90', '2026-09-28 10:00');
        Closing::openForActiveBranches('2026-09-29');
        Closing::openForActiveBranches('2026-09-30');
        $this->actingAs($this->financialAuditor());

        $this->get(route('closings.index', ['tab' => 'register', 'from' => '2026-09-01', 'to' => '2026-09-30']))->assertInertia(fn ($page) => $page
            ->where('register.totals.total', '650.00')
            ->where('register.rows', fn ($rows): bool => collect($rows)->where('total', '!=', '0.00')->map(fn ($row) => [$row['day'], $row['branchName'], $row['total']])->values()->all() === [
                ['2026-09-30', 'South', '250.00'],
                ['2026-09-29', 'North', '400.00'],
            ])
            ->where('register.missing', fn ($missing): bool => collect($missing)->map(fn ($day) => [$day['branchName'], $day['day']])->all() === [['South', '2026-09-28']]));
        $this->get(route('closings.index', ['tab' => 'register', 'from' => '2026-09-01', 'to' => '2026-09-30', 'filter_branch' => $this->north->id]))
            ->assertInertia(fn ($page) => $page->where('register.totals.total', '400.00'));

        $csv = $this->get(route('closings.export', ['from' => '2026-09-01', 'to' => '2026-09-30']))->assertOk()->streamedContent();

        $this->assertStringStartsWith("\u{FEFF}التاريخ,الفرع,\"رقم الكشف\"", $csv);
        $this->assertStringContainsString('2026-09-30,South', $csv);
        $this->assertStringContainsString('المجموع', $csv);
    }

    public function test_a_branch_preparer_reports_only_on_their_own_branch(): void
    {
        $this->payment($this->north, '400', '2026-09-29 10:00');
        $this->payment($this->south, '250', '2026-09-29 11:00');
        Closing::openForActiveBranches('2026-09-29');
        $preparer = User::factory()->accountant()->create(['branch_id' => $this->north->id]);
        $preparer->permissions()->sync(Permission::idsFor([PermissionKey::PrepareClosings, PermissionKey::ExportFinancialReports]));

        $this->actingAs($preparer)->get(route('closings.index', ['tab' => 'register', 'from' => '2026-09-01', 'to' => '2026-09-30', 'filter_branch' => $this->south->id]))
            ->assertInertia(fn ($page) => $page
                ->where('register.totals.total', '400.00')
                ->where('register.rows', fn ($rows): bool => collect($rows)->pluck('branchName')->unique()->values()->all() === ['North']));
        $this->assertStringNotContainsString('South', $this->get(route('closings.export', ['from' => '2026-09-01', 'to' => '2026-09-30']))->streamedContent());
    }

    public function test_a_new_financial_auditor_gets_the_company_wide_view_only_from_the_super_admin(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $branchAdmin = User::factory()->branchAdmin()->create(['branch_id' => $this->north->id]);

        $this->actingAs($superAdmin);
        $fromSuperAdmin = User::factory()->financialAuditor()->create();
        $this->actingAs($branchAdmin);
        $fromBranchAdmin = User::factory()->financialAuditor()->create(['branch_id' => $this->north->id]);

        $this->assertTrue($fromSuperAdmin->fresh()->hasPermission(PermissionKey::ViewAllClosings));
        $this->assertFalse($fromBranchAdmin->fresh()->hasPermission(PermissionKey::ViewAllClosings));
    }

    public function test_a_register_period_is_valid_and_at_most_a_quarter(): void
    {
        $this->actingAs($this->financialAuditor())
            ->get(route('closings.index', ['tab' => 'register', 'from' => '2026-01-01', 'to' => '2026-09-30']))
            ->assertSessionHasErrors(['from' => 'اختر فترة صحيحة لا تزيد على ثلاثة أشهر.']);
    }

    private function financialAuditor(): User
    {
        $user = User::factory()->financialAuditor()->create(['branch_id' => $this->north->id]);
        $user->permissions()->sync(Permission::idsFor([PermissionKey::ViewAllClosings, PermissionKey::ExportFinancialReports]));

        return $user;
    }

    private function payment(Branch $branch, string $amount, string $at): void
    {
        $this->travelTo(Carbon::parse($at, 'Asia/Gaza'));
        SubscriptionTransaction::recordPayment(Subscription::factory()->create(['branch_id' => $branch->id]), User::factory()->create(), [
            'amount' => $amount, 'currency' => 'ILS', 'payment_method' => 'cash',
        ]);
        $this->travelTo(Carbon::parse('2026-10-01 10:00', 'Asia/Gaza'));
    }
}
