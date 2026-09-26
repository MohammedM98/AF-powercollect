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
            ->from(route('meter-readings.index'))
            ->post(route('meter-readings.approve'), ['reading_ids' => [$approved->id]])
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'meter-readings-approved')
            ->assertRedirect(route('meter-readings.index'));

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

    public function test_approve_all_takes_the_weeks_pending_readings_matching_the_sheets_search_in_the_accountants_branch(): void
    {
        $matching = [$this->pendingReading('2026-09-18', '5.00', 'Ahmad One'), $this->pendingReading('2026-09-18', '6.00', 'Ahmad Two')];
        $otherName = $this->pendingReading('2026-09-18', '7.00', 'Sara');
        $earlierWeek = $this->pendingReading('2026-09-11', '8.00', 'Ahmad Three');
        $otherBranch = MeterReading::factory()->create([
            'subscriber_id' => Subscriber::factory()->create(['full_name' => 'Ahmad Elsewhere']),
            'week_start' => '2026-09-18',
        ]);

        $this->actingAs($this->accountant)
            ->post(route('meter-readings.approve'), ['all' => true, 'week' => '2026-09-18', 'search' => 'Ahmad'])
            ->assertSessionHasNoErrors();

        foreach ($matching as $reading) {
            $this->assertSame(MeterReadingStatus::Approved, $reading->fresh()->status);
        }
        foreach ([$otherName, $earlierWeek, $otherBranch] as $reading) {
            $this->assertSame(MeterReadingStatus::Pending, $reading->fresh()->status);
        }
        $this->assertDatabaseCount('subscriber_transactions', 2);
    }

    public function test_a_reading_is_charged_only_once_and_another_branchs_reading_is_skipped(): void
    {
        $reading = $this->pendingReading('2026-09-18', '42.50');
        $otherBranch = MeterReading::factory()->create();
        $this->actingAs($this->accountant);

        $this->post(route('meter-readings.approve'), ['reading_ids' => [$reading->id]])->assertSessionHasNoErrors();
        $this->post(route('meter-readings.approve'), ['reading_ids' => [$reading->id, $otherBranch->id]])
            ->assertSessionHasErrors(['reading_ids' => 'لا توجد قراءات بانتظار الاعتماد ضمن اختيارك.']);

        $this->assertDatabaseCount('subscriber_transactions', 1);
        $this->assertSame(MeterReadingStatus::Pending, $otherBranch->fresh()->status);
    }

    public function test_ticked_readings_are_required_unless_approving_all_of_a_week(): void
    {
        $this->actingAs($this->accountant)
            ->post(route('meter-readings.approve'), [])
            ->assertSessionHasErrors(['reading_ids' => 'اختر قراءة واحدة على الأقل لاعتمادها.']);

        $this->actingAs($this->accountant)
            ->post(route('meter-readings.approve'), ['all' => true])
            ->assertSessionHasErrors('week');
    }

    public function test_the_readings_sheet_offers_approval_of_the_weeks_pending_readings_to_the_accountant(): void
    {
        $pending = $this->pendingReading('2026-09-18', '42.50', 'Ahmad Pending');
        $this->pendingReading('2026-09-18', '7.50', 'Basem Pending');
        $approved = $this->pendingReading('2026-09-18', '1.00', 'Carla Approved');
        $approved->approve($this->accountant);
        $this->pendingReading('2026-09-11', '9.00', 'Dana Earlier');

        $this->actingAs($this->accountant)
            ->get(route('meter-readings.index', ['week' => '2026-09-18']))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('canApprove', true)
                ->where('entryWindow.appliesToActor', false)
                ->where('pendingApproval.count', 2)
                ->where('pendingApproval.amountDue', '50.00')
                ->where('rows.data', fn ($rows): bool => collect($rows)->mapWithKeys(fn ($row) => [$row['fullName'] => $row['canApprove']])->all() === [
                    'Ahmad Pending' => true,
                    'Basem Pending' => true,
                    'Carla Approved' => false,
                    'Dana Earlier' => false,
                ]));
    }

    public function test_the_readings_sheet_shows_no_approval_to_data_entry(): void
    {
        $this->pendingReading('2026-09-18', '42.50');
        $dataEntry = User::factory()->dataEntry()->create(['branch_id' => $this->branch->id]);

        $this->actingAs($dataEntry)
            ->get(route('meter-readings.index'))
            ->assertInertia(fn ($page) => $page
                ->where('canApprove', false)
                ->where('pendingApproval', null)
                ->where('rows.data.0.canApprove', false));
    }

    public function test_approving_takes_its_own_permission_which_branch_admins_lack_by_default(): void
    {
        $reading = $this->pendingReading('2026-09-18', '42.50');
        $branchAdmin = User::factory()->branchAdmin()->create(['branch_id' => $this->branch->id]);

        $this->actingAs($branchAdmin)->post(route('meter-readings.approve'), ['reading_ids' => [$reading->id]])->assertForbidden();

        $this->assertSame(MeterReadingStatus::Pending, $reading->fresh()->status);
    }

    public function test_the_super_admin_can_grant_approving_to_any_employee_from_the_permissions_page(): void
    {
        $collector = User::factory()->collector()->create(['branch_id' => $this->branch->id]);
        $approve = Permission::idsFor([PermissionKey::ApproveMeterReadings])[0];

        $this->actingAs(User::factory()->superAdmin()->create())
            ->put(route('settings.permissions.update'), ['permissions' => [$collector->id => [$approve]]])
            ->assertSessionHasNoErrors();

        $this->actingAs($collector->fresh())
            ->get(route('meter-readings.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('canApprove', true));
    }

    private function pendingReading(string $weekStart, string $amountDue, ?string $subscriberName = null): MeterReading
    {
        return MeterReading::factory()->create([
            'subscriber_id' => Subscriber::factory()->create(array_filter(['branch_id' => $this->branch->id, 'full_name' => $subscriberName])),
            'week_start' => $weekStart,
            'week_end' => now()->parse($weekStart)->addDays(6),
            'amount_due' => $amountDue,
        ]);
    }
}
