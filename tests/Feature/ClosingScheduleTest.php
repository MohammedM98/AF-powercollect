<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\ClosingSetting;
use App\Models\Permission;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Support\ClosingPeriods;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class ClosingScheduleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.business_timezone' => 'Asia/Gaza']);
        $this->travelTo(Carbon::parse('2026-10-01 10:00', 'Asia/Gaza'));
    }

    public function test_the_super_admin_sets_the_cutoff_week_start_and_automatic_opening_by_hand(): void
    {
        $admin = User::factory()->superAdmin()->create();

        $this->actingAs($admin)->put(route('settings.closing-schedule.update'), ['cutoff_time' => '18:00', 'week_starts_on' => 0, 'auto_open' => false])
            ->assertSessionHasNoErrors();

        $setting = ClosingSetting::sole();
        $this->assertSame('18:00', $setting->cutoff());
        $this->assertSame(0, $setting->week_starts_on);
        $this->assertFalse($setting->auto_open);
        $this->assertSame($admin->id, $setting->updated_by);
    }

    #[TestWith(['09:00'])]
    #[TestWith(['25:00'])]
    public function test_the_cutoff_is_midnight_or_from_noon_on(string $cutoff): void
    {
        $this->actingAs(User::factory()->superAdmin()->create())
            ->put(route('settings.closing-schedule.update'), ['cutoff_time' => $cutoff, 'week_starts_on' => 6, 'auto_open' => true])
            ->assertSessionHasErrors('cutoff_time');

        $this->assertSame('00:00', ClosingSetting::company()->cutoff());
    }

    public function test_only_the_super_admin_manages_the_closing_schedule(): void
    {
        $reviewer = User::factory()->accountant()->create();
        $reviewer->permissions()->sync(Permission::idsFor([PermissionKey::AuditClosings, PermissionKey::PrepareClosings]));
        $this->actingAs($reviewer);

        $this->get(route('settings.closing-schedule.edit'))->assertForbidden();
        $this->put(route('settings.closing-schedule.update'), ['cutoff_time' => '18:00', 'week_starts_on' => 6, 'auto_open' => true])->assertForbidden();
        $this->post(route('settings.closing-schedule.open'), ['date' => '2026-09-30'])->assertForbidden();
    }

    public function test_with_an_evening_cutoff_later_payments_count_for_the_next_day(): void
    {
        ClosingSetting::company()->update(['cutoff_time' => '18:00']);
        $branch = Branch::factory()->create();
        $before = $this->payment($branch, '2026-09-29 17:59');
        $after = $this->payment($branch, '2026-09-29 18:00');

        $this->travelTo(Carbon::parse('2026-09-30 18:30', 'Asia/Gaza'));
        Closing::openForActiveBranches('2026-09-29');
        Closing::openForActiveBranches('2026-09-30');

        $this->assertSame([$before->id], Closing::where('branch_id', $branch->id)->whereDate('period_start', '2026-09-29')->sole()->lines()->pluck('subscription_transaction_id')->all());
        $this->assertSame([$after->id], Closing::where('branch_id', $branch->id)->whereDate('period_start', '2026-09-30')->sole()->lines()->pluck('subscription_transaction_id')->all());
    }

    public function test_with_automatic_opening_off_closings_open_only_by_hand(): void
    {
        ClosingSetting::company()->update(['auto_open' => false]);
        Branch::factory()->create();

        $this->artisan('closings:open')->assertSuccessful();
        $this->assertSame(0, Closing::count());

        $this->actingAs(User::factory()->superAdmin()->create());
        $this->post(route('settings.closing-schedule.open'), ['date' => '2026-10-01'])->assertSessionHasErrors('date');
        $this->post(route('settings.closing-schedule.open'), ['date' => '2026-09-30'])->assertSessionHasNoErrors();
        $this->assertSame(Branch::where('is_active', true)->count(), Closing::count());
    }

    public function test_a_branch_admin_sets_only_their_own_branchs_cutoff_and_automatic_opening(): void
    {
        $branch = Branch::factory()->create();
        $other = Branch::factory()->create();
        $admin = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);

        $this->actingAs($admin)->put(route('settings.closing-schedule.update'), ['branch_id' => $branch->id, 'cutoff_time' => '20:00', 'auto_open' => false])
            ->assertSessionHasNoErrors();

        $own = ClosingSetting::ownFor($branch);
        $this->assertSame('20:00', $own->cutoff());
        $this->assertFalse($own->auto_open);
        $this->assertSame($admin->id, $own->updated_by);
        $this->assertNull(ClosingSetting::ownFor($other));
        $this->assertSame('00:00', ClosingSetting::company()->cutoff());
        $this->assertSame('00:00', ClosingSetting::forBranch($other)->cutoff());
        $this->assertSame('20:00', ClosingSetting::forBranch($branch)->cutoff());
    }

    public function test_saving_a_branchs_schedule_again_updates_it_and_leaves_the_week_start_to_the_company(): void
    {
        $branch = Branch::factory()->create();
        $this->actingAs(User::factory()->branchAdmin()->create(['branch_id' => $branch->id]));

        $this->put(route('settings.closing-schedule.update'), ['branch_id' => $branch->id, 'cutoff_time' => '20:00', 'week_starts_on' => 1, 'auto_open' => true])->assertSessionHasNoErrors();
        $this->put(route('settings.closing-schedule.update'), ['branch_id' => $branch->id, 'cutoff_time' => '22:00', 'auto_open' => true])->assertSessionHasNoErrors();

        $this->assertSame(1, ClosingSetting::where('branch_id', $branch->id)->count());
        $this->assertSame('22:00', ClosingSetting::ownFor($branch)->cutoff());
        $this->assertNull(ClosingSetting::ownFor($branch)->week_starts_on);
        $this->assertSame(ClosingSetting::DEFAULT_WEEK_START, ClosingSetting::company()->week_starts_on);
        $this->assertSame(ClosingSetting::DEFAULT_WEEK_START, ClosingPeriods::week('2026-10-01')[0]->dayOfWeek);
    }

    public function test_the_company_week_start_is_required_for_the_company_but_not_for_a_branch(): void
    {
        $branch = Branch::factory()->create();
        $this->actingAs(User::factory()->superAdmin()->create());

        $this->put(route('settings.closing-schedule.update'), ['cutoff_time' => '18:00', 'auto_open' => true])->assertSessionHasErrors('week_starts_on');
        $this->put(route('settings.closing-schedule.update'), ['branch_id' => $branch->id, 'cutoff_time' => '18:00', 'auto_open' => true])->assertSessionHasNoErrors();
        $this->put(route('settings.closing-schedule.update'), ['branch_id' => 9999, 'cutoff_time' => '18:00', 'auto_open' => true])->assertSessionHasErrors('branch_id');
    }

    public function test_a_branch_admin_cannot_manage_the_company_default_or_another_branch(): void
    {
        $branch = Branch::factory()->create();
        $other = Branch::factory()->create();
        $this->actingAs(User::factory()->branchAdmin()->create(['branch_id' => $branch->id]));

        $this->get(route('settings.closing-schedule.edit', ['branch' => $other->id]))->assertForbidden();
        $this->put(route('settings.closing-schedule.update'), ['cutoff_time' => '18:00', 'week_starts_on' => 0, 'auto_open' => false])->assertForbidden();
        $this->put(route('settings.closing-schedule.update'), ['branch_id' => $other->id, 'cutoff_time' => '18:00', 'auto_open' => false])->assertForbidden();
        $this->post(route('settings.closing-schedule.open'), ['date' => '2026-09-30'])->assertForbidden();
        $this->post(route('settings.closing-schedule.open'), ['date' => '2026-09-30', 'branch_id' => $other->id])->assertForbidden();

        $this->assertSame(0, ClosingSetting::where('cutoff_time', '18:00:00')->count());
        $this->assertSame(0, Closing::count());
    }

    public function test_a_branch_admin_sees_their_own_branch_and_the_super_admin_picks_one(): void
    {
        $branch = Branch::factory()->create(['name' => 'Alpha']);
        $following = Branch::factory()->create(['name' => 'Beta']);
        ClosingSetting::create(['branch_id' => $branch->id, 'cutoff_time' => '20:00', 'auto_open' => false]);

        $this->actingAs(User::factory()->branchAdmin()->create(['branch_id' => $branch->id]))
            ->get(route('settings.closing-schedule.edit'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Settings/ClosingSchedule')
                ->where('branch', ['id' => $branch->id, 'name' => 'Alpha'])
                ->where('branches', [])
                ->where('followsCompany', false)
                ->where('setting.cutoff_time', '20:00')
                ->where('setting.auto_open', false)
                ->where('setting.week_starts_on', ClosingSetting::DEFAULT_WEEK_START));

        $this->actingAs(User::factory()->superAdmin()->create());
        $this->get(route('settings.closing-schedule.edit', ['branch' => $following->id]))
            ->assertInertia(fn ($page) => $page
                ->where('branch.id', $following->id)
                ->where('followsCompany', true)
                ->where('branchesWithOwn', 1)
                ->where('setting.cutoff_time', '00:00')
                ->where('branches', [
                    ['value' => $branch->id, 'label' => 'Alpha', 'hasOwn' => true],
                    ['value' => $following->id, 'label' => 'Beta', 'hasOwn' => false],
                ]));
        $this->get(route('settings.closing-schedule.edit'))->assertInertia(fn ($page) => $page->where('branch', null));
    }

    public function test_each_branch_closes_its_day_at_its_own_cutoff(): void
    {
        $evening = Branch::factory()->create();
        $midnight = Branch::factory()->create();
        ClosingSetting::create(['branch_id' => $evening->id, 'cutoff_time' => '18:00', 'auto_open' => true]);
        $eveningPayment = $this->payment($evening, '2026-09-29 19:00');
        $midnightPayment = $this->payment($midnight, '2026-09-29 19:00');

        Closing::openForActiveBranches('2026-09-29');
        Closing::openForActiveBranches('2026-09-30');

        $lines = fn (Branch $branch, string $day): array => Closing::where('branch_id', $branch->id)->whereDate('period_start', $day)->sole()->lines()->pluck('subscription_transaction_id')->all();
        $this->assertSame([], $lines($evening, '2026-09-29'));
        $this->assertSame([$eveningPayment->id], $lines($evening, '2026-09-30'));
        $this->assertSame([$midnightPayment->id], $lines($midnight, '2026-09-29'));
        $this->assertSame('2026-09-30', ClosingPeriods::for($evening)->dayOf($eveningPayment->created_at));
        $this->assertSame('2026-09-29', ClosingPeriods::for($midnight)->dayOf($midnightPayment->created_at));
    }

    public function test_a_day_has_closed_in_a_branch_only_after_that_branchs_cutoff(): void
    {
        $evening = Branch::factory()->create();
        $midnight = Branch::factory()->create();
        ClosingSetting::create(['branch_id' => $evening->id, 'cutoff_time' => '18:00', 'auto_open' => true]);

        $this->travelTo(Carbon::parse('2026-09-29 19:00', 'Asia/Gaza'));

        $this->assertTrue(Closing::openFor($evening, '2026-09-29'));
        $this->assertFalse(Closing::openFor($midnight, '2026-09-29'));
        $this->assertSame('2026-09-30', ClosingPeriods::for($evening)->today()->toDateString());
        $this->assertSame('2026-09-29', ClosingPeriods::for($midnight)->today()->toDateString());
        $this->assertSame(1, Closing::count());
        $this->assertFalse(ClosingPeriods::hasEndedInAll(collect([$evening, $midnight]), '2026-09-29'));
        $this->assertTrue(ClosingPeriods::hasEndedInAll(collect([$evening, $midnight]), '2026-09-28'));
        $this->assertSame('2026-09-30', ClosingPeriods::furthestToday(collect([$evening, $midnight]))->toDateString());
    }

    public function test_closings_open_by_themselves_only_in_the_branches_that_allow_it(): void
    {
        $manual = Branch::factory()->create();
        $automatic = Branch::factory()->create();
        ClosingSetting::create(['branch_id' => $manual->id, 'cutoff_time' => '00:00', 'auto_open' => false]);

        $this->artisan('closings:open')->assertSuccessful();

        $this->assertSame([$automatic->id], Closing::pluck('branch_id')->all());

        $this->artisan('closings:open', ['--date' => '2026-09-30'])->assertSuccessful();
        $this->assertEqualsCanonicalizing([$automatic->id, $manual->id], Closing::whereDate('period_start', '2026-09-30')->pluck('branch_id')->all());
    }

    public function test_a_branch_admin_opens_a_closed_day_for_their_own_branch_only(): void
    {
        $branch = Branch::factory()->create();
        $other = Branch::factory()->create();
        ClosingSetting::company()->update(['auto_open' => false]);
        $this->actingAs(User::factory()->branchAdmin()->create(['branch_id' => $branch->id]));

        $this->post(route('settings.closing-schedule.open'), ['date' => '2026-10-01', 'branch_id' => $branch->id])->assertSessionHasErrors('date');
        $this->post(route('settings.closing-schedule.open'), ['date' => '2026-09-30', 'branch_id' => $branch->id])->assertSessionHasNoErrors();

        $this->assertSame([$branch->id], Closing::pluck('branch_id')->all());
        $this->assertNull(Closing::where('branch_id', $other->id)->first());
    }

    public function test_the_company_week_has_ended_only_once_its_last_day_has_closed_in_every_branch(): void
    {
        $evening = Branch::factory()->create();
        $midnight = Branch::factory()->create();
        ClosingSetting::create(['branch_id' => $evening->id, 'cutoff_time' => '18:00', 'auto_open' => true]);
        $viewPeriod = fn () => $this->actingAs(User::factory()->superAdmin()->create())
            ->get(route('closings.index', ['tab' => 'period', 'period' => 'weekly', 'branch' => $evening->id, 'date' => '2026-09-30']));

        // The week is Saturday 26 Sep to Friday 2 Oct. On Friday evening the evening branch has closed its last day; the other one has not.
        $this->travelTo(Carbon::parse('2026-10-02 19:00', 'Asia/Gaza'));
        $viewPeriod()->assertInertia(fn ($page) => $page
            ->where('periodView.last', '2026-10-02')
            ->where('periodView.ended', false)
            ->where('periodView.canApprove', false));

        $this->travelTo(Carbon::parse('2026-10-03 00:30', 'Asia/Gaza'));
        $viewPeriod()->assertInertia(fn ($page) => $page->where('periodView.ended', true));
    }

    public function test_a_branchs_row_in_the_week_view_shows_its_own_day_as_still_open_or_closed(): void
    {
        $evening = Branch::factory()->create();
        $midnight = Branch::factory()->create();
        ClosingSetting::create(['branch_id' => $evening->id, 'cutoff_time' => '18:00', 'auto_open' => true]);
        $this->payment($evening, '2026-09-29 12:00');
        $this->payment($midnight, '2026-09-29 12:00');
        $this->travelTo(Carbon::parse('2026-09-29 19:00', 'Asia/Gaza'));

        $this->actingAs(User::factory()->superAdmin()->create())
            ->get(route('closings.index', ['tab' => 'period', 'period' => 'weekly', 'branch' => $evening->id, 'date' => '2026-09-29']))
            ->assertInertia(function ($page) use ($evening, $midnight): void {
                $cells = fn (Branch $branch): array => collect($page->toArray()['props']['periodView']['rows'])->firstWhere('branchId', $branch->id)['cells'];
                $stateOn = fn (Branch $branch, string $day): string => collect($cells($branch))->firstWhere('day', $day)['state'];

                // At 19:00 on 29 Sep that day has closed for the evening branch (its next day, 30 Sep, is under way) but not for the midnight one.
                $this->assertSame('missing', $stateOn($evening, '2026-09-29'));
                $this->assertSame('open', $stateOn($evening, '2026-09-30'));
                $this->assertSame('open', $stateOn($midnight, '2026-09-29'));
                $this->assertSame('future', $stateOn($midnight, '2026-09-30'));
            });
    }

    private function payment(Branch $branch, string $at): SubscriptionTransaction
    {
        $this->travelTo(Carbon::parse($at, 'Asia/Gaza'));
        $payment = SubscriptionTransaction::recordPayment(Subscription::factory()->create(['branch_id' => $branch->id]), User::factory()->create(), [
            'amount' => '10', 'currency' => 'ILS', 'payment_method' => 'cash',
        ]);
        $this->travelTo(Carbon::parse('2026-10-01 10:00', 'Asia/Gaza'));

        return $payment;
    }
}
