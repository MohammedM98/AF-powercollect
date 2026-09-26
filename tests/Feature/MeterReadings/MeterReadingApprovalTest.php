<?php

namespace Tests\Feature\MeterReadings;

use App\Enums\MeterReadingStatus;
use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\MeterReading;
use App\Models\Permission;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MeterReadingApprovalTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;

    private User $accountant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo('2026-09-24 10:00:00');

        $this->branch = Branch::factory()->create();
        $this->accountant = User::factory()->accountant()->create(['branch_id' => $this->branch->id]);
    }

    public function test_the_accountant_approves_the_ticked_readings_and_charges_their_subscribers(): void
    {
        $approved = $this->pendingReading('2026-09-18', '42.50');
        $untouched = $this->pendingReading('2026-09-18', '10.00');

        $this->actingAs($this->accountant)
            ->from(route('meter-reading-approvals.index'))
            ->post(route('meter-reading-approvals.store'), ['reading_ids' => [$approved->id]])
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'meter-readings-approved')
            ->assertRedirect(route('meter-reading-approvals.index'));

        $approved->refresh();
        $this->assertSame(MeterReadingStatus::Approved, $approved->status);
        $this->assertTrue($approved->approvedBy->is($this->accountant));
        $this->assertTrue($approved->approved_at->equalTo(now()));
        $this->assertSame(MeterReadingStatus::Pending, $untouched->fresh()->status);

        $transaction = SubscriberTransaction::sole();
        $this->assertSame($approved->subscriber_id, $transaction->subscriber_id);
        $this->assertSame(SubscriberTransaction::TYPE_METER_READING, $transaction->type);
        $this->assertSame('42.50', $transaction->amount);
        $this->assertTrue($transaction->recordedBy->is($this->accountant));

        $this->actingAs($this->accountant)
            ->get(route('subscribers.index', ['search' => $approved->subscriber->full_name]))
            ->assertInertia(fn ($page) => $page->where('subscribers.data.0.outstandingBalance', fn ($balance): bool => (float) $balance === 42.5));
    }

    public function test_approve_all_takes_every_pending_reading_matching_the_filters_in_the_accountants_branch(): void
    {
        $thisWeek = [$this->pendingReading('2026-09-18', '5.00'), $this->pendingReading('2026-09-18', '6.00')];
        $earlierWeek = $this->pendingReading('2026-09-11', '7.00');
        $otherBranch = MeterReading::factory()->create(['week_start' => '2026-09-18']);

        $this->actingAs($this->accountant)
            ->post(route('meter-reading-approvals.store'), ['all' => true, 'filter' => ['week_start' => '2026-09-18']])
            ->assertSessionHasNoErrors();

        foreach ($thisWeek as $reading) {
            $this->assertSame(MeterReadingStatus::Approved, $reading->fresh()->status);
        }
        $this->assertSame(MeterReadingStatus::Pending, $earlierWeek->fresh()->status);
        $this->assertSame(MeterReadingStatus::Pending, $otherBranch->fresh()->status);
        $this->assertDatabaseCount('subscriber_transactions', 2);
    }

    public function test_a_reading_is_charged_only_once_and_another_branchs_reading_is_skipped(): void
    {
        $reading = $this->pendingReading('2026-09-18', '42.50');
        $otherBranch = MeterReading::factory()->create();
        $this->actingAs($this->accountant);

        $this->post(route('meter-reading-approvals.store'), ['reading_ids' => [$reading->id]])->assertSessionHasNoErrors();
        $this->post(route('meter-reading-approvals.store'), ['reading_ids' => [$reading->id, $otherBranch->id]])
            ->assertSessionHasErrors(['reading_ids' => 'لا توجد قراءات بانتظار الاعتماد ضمن اختيارك.']);

        $this->assertDatabaseCount('subscriber_transactions', 1);
        $this->assertSame(MeterReadingStatus::Pending, $otherBranch->fresh()->status);
    }

    public function test_ticked_readings_are_required_unless_approving_all(): void
    {
        $this->actingAs($this->accountant)
            ->post(route('meter-reading-approvals.store'), [])
            ->assertSessionHasErrors(['reading_ids' => 'اختر قراءة واحدة على الأقل لاعتمادها.']);
    }

    public function test_the_approvals_page_lists_only_pending_readings_in_the_accountants_branch_with_totals(): void
    {
        $pending = $this->pendingReading('2026-09-18', '42.50');
        $this->pendingReading('2026-09-11', '7.50');
        $this->pendingReading('2026-09-04', '1.00')->approve($this->accountant);
        MeterReading::factory()->create();

        $this->actingAs($this->accountant)
            ->get(route('meter-reading-approvals.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('MeterReadingApprovals/Index')
                ->has('readings.data', 2)
                ->where('readings.data.0.id', $pending->id)
                ->where('summary.count', 2)
                ->where('summary.amountDue', '50.00')
                ->where('filterOptions.0.options.0.value', '2026-09-18')
                ->where('can.approveMeterReadings', true));
    }

    public function test_approving_takes_its_own_permission_which_branch_admins_lack_by_default(): void
    {
        $reading = $this->pendingReading('2026-09-18', '42.50');
        $branchAdmin = User::factory()->branchAdmin()->create(['branch_id' => $this->branch->id]);

        $this->actingAs($branchAdmin)->get(route('meter-reading-approvals.index'))->assertForbidden();
        $this->actingAs($branchAdmin)->post(route('meter-reading-approvals.store'), ['reading_ids' => [$reading->id]])->assertForbidden();

        $this->assertSame(MeterReadingStatus::Pending, $reading->fresh()->status);
    }

    public function test_the_super_admin_can_grant_approving_to_any_employee_from_the_permissions_page(): void
    {
        $collector = User::factory()->collector()->create(['branch_id' => $this->branch->id]);
        $approve = Permission::idsFor([PermissionKey::ApproveMeterReadings])[0];

        $this->actingAs(User::factory()->superAdmin()->create())
            ->put(route('settings.permissions.update'), ['permissions' => [$collector->id => [$approve]]])
            ->assertSessionHasNoErrors();

        $this->actingAs($collector->fresh())->get(route('meter-reading-approvals.index'))->assertOk();
    }

    private function pendingReading(string $weekStart, string $amountDue): MeterReading
    {
        return MeterReading::factory()->create([
            'subscriber_id' => Subscriber::factory()->create(['branch_id' => $this->branch->id]),
            'week_start' => $weekStart,
            'week_end' => now()->parse($weekStart)->addDays(6),
            'amount_due' => $amountDue,
        ]);
    }
}
