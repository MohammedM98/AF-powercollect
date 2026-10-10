<?php

namespace Tests\Feature;

use App\Enums\ClosingPeriodStatus;
use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\ClosingPeriod;
use App\Models\ClosingSetting;
use App\Models\Permission;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Support\WeeklyClosingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class EarlyWeeklyClosingTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Branch $branch;

    private Subscription $subscription;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.business_timezone' => 'Asia/Hebron']);
        $this->travelTo(Carbon::parse('2026-09-28 10:00', 'Asia/Hebron'));
        ClosingSetting::current()->update(['allow_early_weekly_close' => true]);
        $this->admin = User::factory()->superAdmin()->create();
        $this->branch = Branch::factory()->create();
        $this->subscription = Subscription::factory()->create(['branch_id' => $this->branch->id]);
    }

    public function test_the_week_under_way_is_closed_now_and_the_next_week_starts_at_that_moment(): void
    {
        $payment = $this->weekWithOnePayment();
        $original = ClosingPeriod::findOrFail($payment->closing_period_id);
        $scheduledCutoff = $original->cutoff_at;
        $this->travelTo(Carbon::parse('2026-09-30 15:00', 'Asia/Hebron'));

        $this->closeEarly()->assertSessionHasNoErrors();

        $period = $original->fresh();
        $next = ClosingPeriod::query()->whereKeyNot($period->id)->sole();
        $this->assertSame(ClosingPeriodStatus::Closed, $period->status);
        $this->assertTrue($period->cutoff_at->equalTo(now()->startOfSecond()));
        $this->assertTrue($period->scheduled_cutoff_at->equalTo($scheduledCutoff));
        $this->assertSame('2026-09-30', $period->period_end->toDateString());
        $this->assertSame('100.00', Closing::where('number', $period->number)->sole()->snapshot['report']['actualCollectionTotal']);
        $this->assertTrue($next->starts_at->equalTo($period->cutoff_at));
        $this->assertSame(ClosingPeriodStatus::Open, $next->status);
        $this->assertSame('2026-10-01', $next->period_start->toDateString());
        $this->assertSame('2026-10-09', $next->period_end->toDateString());
        $this->assertSame('2026-10-10 00:00', $next->cutoff_at->timezone('Asia/Hebron')->format('Y-m-d H:i'));
        $this->assertNotSame($period->number, $next->number);
        $this->assertDatabaseHas('closing_events', ['closing_period_id' => $period->id, 'action' => 'PERIOD_ENDED_EARLY', 'user_id' => $this->admin->id]);
    }

    public function test_what_is_recorded_after_the_early_close_belongs_to_the_next_week(): void
    {
        $payment = $this->weekWithOnePayment();
        $this->travelTo(Carbon::parse('2026-09-30 15:00:30', 'Asia/Hebron'));
        $this->closeEarly()->assertSessionHasNoErrors();

        $later = SubscriptionTransaction::recordPayment($this->subscription, $this->admin, ['amount' => '40', 'currency' => 'ILS', 'payment_method' => 'cash']);

        $closed = ClosingPeriod::findOrFail($payment->closing_period_id);
        $next = ClosingPeriod::query()->whereKeyNot($closed->id)->sole();
        $this->assertSame($next->id, $later->closing_period_id);
        $this->assertSame('100.00', app(WeeklyClosingService::class)->report($closed)['actualCollectionTotal']);
        $this->assertSame('40.00', app(WeeklyClosingService::class)->report($next)['actualCollectionTotal']);
    }

    public function test_closing_on_the_last_day_still_starts_the_next_week_right_away(): void
    {
        $payment = $this->weekWithOnePayment();
        $this->travelTo(Carbon::parse('2026-10-02 18:00', 'Asia/Hebron'));

        $this->closeEarly()->assertSessionHasNoErrors();

        $closed = ClosingPeriod::findOrFail($payment->closing_period_id);
        $next = ClosingPeriod::query()->whereKeyNot($closed->id)->sole();
        $this->assertSame('2026-10-02', $closed->period_end->toDateString());
        $this->assertSame('2026-10-03', $next->period_start->toDateString());
        $this->assertTrue($next->starts_at->equalTo($closed->cutoff_at));
        $this->assertSame('2026-10-10 00:00', $next->cutoff_at->timezone('Asia/Hebron')->format('Y-m-d H:i'));
    }

    public function test_nothing_changes_while_the_company_has_not_allowed_it(): void
    {
        $payment = $this->weekWithOnePayment();
        ClosingSetting::current()->update(['allow_early_weekly_close' => false]);
        $this->travelTo(Carbon::parse('2026-09-30 15:00', 'Asia/Hebron'));
        $before = ClosingPeriod::findOrFail($payment->closing_period_id);

        $this->closeEarly()->assertSessionHasErrors(['period' => 'إغلاق الأسبوع قبل موعده غير مفعّل.']);

        $this->assertUntouched($before);
    }

    public function test_a_day_with_payments_and_no_approved_closing_stops_the_early_close_and_undoes_it(): void
    {
        $payment = $this->weekWithOnePayment(approveTheDay: false);
        $this->travelTo(Carbon::parse('2026-09-30 15:00', 'Asia/Hebron'));
        $before = ClosingPeriod::findOrFail($payment->closing_period_id);

        $this->closeEarly()->assertSessionHasErrors('period');

        $this->assertUntouched($before, closings: 0);
    }

    public function test_only_the_week_before_its_scheduled_cutoff_can_be_closed_early(): void
    {
        $payment = $this->weekWithOnePayment();
        $period = ClosingPeriod::findOrFail($payment->closing_period_id);
        $this->travelTo($period->cutoff_at->addMinute());

        $this->closeEarly()->assertSessionHasErrors(['period' => 'لا يُغلق قبل موعده إلا الأسبوع الجاري.']);
        $this->post(route('period-closings.store'), ['period' => 'weekly', 'date' => '2026-09-28'])->assertSessionHasNoErrors();

        $this->assertSame(ClosingPeriodStatus::Closed, $period->fresh()->status);
        $this->assertNull($period->fresh()->scheduled_cutoff_at);
    }

    public function test_the_next_week_then_closes_normally_at_its_own_cutoff(): void
    {
        $payment = $this->weekWithOnePayment();
        $this->travelTo(Carbon::parse('2026-09-30 15:00', 'Asia/Hebron'));
        $this->closeEarly()->assertSessionHasNoErrors();
        SubscriptionTransaction::recordPayment($this->subscription, $this->admin, ['amount' => '40', 'currency' => 'ILS', 'payment_method' => 'cash']);
        Closing::factory()->approved()->forDay('2026-09-30')->create(['branch_id' => $this->branch->id]);
        $next = ClosingPeriod::query()->whereKeyNot($payment->closing_period_id)->sole();
        $this->travelTo($next->cutoff_at->addMinute());

        $this->artisan('closings:prepare')->assertSuccessful();
        $this->post(route('period-closings.store'), ['period' => 'weekly', 'date' => '2026-10-05'])->assertSessionHasNoErrors();

        $this->assertSame(ClosingPeriodStatus::Closed, $next->fresh()->status);
        $this->assertNull($next->fresh()->scheduled_cutoff_at);
        $this->assertSame('40.00', Closing::where('number', $next->number)->sole()->snapshot['report']['actualCollectionTotal']);
        $this->assertSame(ClosingPeriodStatus::Closed, ClosingPeriod::findOrFail($payment->closing_period_id)->status);
    }

    public function test_a_user_who_may_not_close_weeks_cannot_close_one_early(): void
    {
        $payment = $this->weekWithOnePayment();
        $this->travelTo(Carbon::parse('2026-09-30 15:00', 'Asia/Hebron'));
        $before = ClosingPeriod::findOrFail($payment->closing_period_id);

        $this->actingAs(User::factory()->accountant()->create(['branch_id' => $this->branch->id]))
            ->post(route('period-closings.store'), ['period' => 'weekly', 'date' => '2026-09-28', 'early' => true])->assertForbidden();

        $this->assertUntouched($before);
    }

    public function test_a_branch_user_given_only_the_early_close_permission_can_close_the_week_early(): void
    {
        $payment = $this->weekWithOnePayment();
        $this->travelTo(Carbon::parse('2026-09-30 15:00', 'Asia/Hebron'));
        $user = $this->userWith(PermissionKey::CloseWeeklyPeriodsEarly);

        $this->actingAs($user)->get(route('closings.index', ['tab' => 'period', 'date' => '2026-09-28']))
            ->assertInertia(fn ($page) => $page->where('periodView.earlyAllowed', true)->where('periodView.canCloseEarly', true)->where('periodView.canApprove', false));
        $this->post(route('period-closings.store'), ['period' => 'weekly', 'date' => '2026-09-28', 'early' => true])->assertSessionHasNoErrors();

        $this->assertSame(ClosingPeriodStatus::Closed, ClosingPeriod::findOrFail($payment->closing_period_id)->status);
        $this->assertDatabaseHas('closing_events', ['action' => 'PERIOD_ENDED_EARLY', 'user_id' => $user->id]);
    }

    public function test_the_early_permission_does_not_open_the_normal_close_and_the_normal_permission_does_not_open_the_early_one(): void
    {
        $payment = $this->weekWithOnePayment();
        $this->travelTo(Carbon::parse('2026-09-30 15:00', 'Asia/Hebron'));
        $before = ClosingPeriod::findOrFail($payment->closing_period_id);

        $this->actingAs($this->userWith(PermissionKey::CloseWeeklyPeriodsEarly))
            ->post(route('period-closings.store'), ['period' => 'weekly', 'date' => '2026-09-28'])->assertForbidden();
        $this->actingAs($this->userWith(PermissionKey::CloseWeeklyPeriods, PermissionKey::AuditClosings))
            ->post(route('period-closings.store'), ['period' => 'weekly', 'date' => '2026-09-28', 'early' => true])->assertForbidden();
        $this->get(route('closings.index', ['tab' => 'period', 'date' => '2026-09-28']))
            ->assertInertia(fn ($page) => $page->where('periodView.earlyAllowed', false)->where('periodView.canCloseEarly', false));

        $this->assertUntouched($before);
    }

    public function test_the_early_close_permissions_are_given_to_nobody_by_default_and_the_weekly_one_only_by_the_company(): void
    {
        foreach (PermissionKey::cases() as $key) {
            Permission::firstOrCreate(['key' => $key->value], ['label' => $key->label()]);
        }

        foreach ([PermissionKey::CloseWeeklyPeriodsEarly, PermissionKey::CloseDayEarly] as $key) {
            $this->assertFalse(User::factory()->branchAdmin()->create()->hasPermission($key));
            $this->assertFalse(User::factory()->accountant()->create()->hasPermission($key));
            $this->assertTrue($this->admin->hasPermission($key));
        }
        $this->assertTrue(PermissionKey::CloseWeeklyPeriodsEarly->isCompanyWide());
        $this->assertFalse(PermissionKey::CloseDayEarly->isCompanyWide());
    }

    public function test_the_month_cannot_be_closed_early(): void
    {
        $this->actingAs($this->admin)->post(route('period-closings.store'), ['period' => 'monthly', 'date' => '2026-09-01', 'early' => true])
            ->assertSessionHasErrors('early');
    }

    public function test_the_period_screen_offers_the_early_close_only_when_it_is_allowed_and_possible(): void
    {
        $payment = $this->weekWithOnePayment();
        $this->travelTo(Carbon::parse('2026-09-30 15:00', 'Asia/Hebron'));
        $screen = fn () => $this->actingAs($this->admin)->get(route('closings.index', ['tab' => 'period', 'date' => '2026-09-28']));

        $screen()->assertInertia(fn ($page) => $page->where('periodView.earlyAllowed', true)->where('periodView.canCloseEarly', true)->where('periodView.canApprove', false)->where('periodView.closedEarly', false));

        ClosingSetting::current()->update(['allow_early_weekly_close' => false]);
        $screen()->assertInertia(fn ($page) => $page->where('periodView.earlyAllowed', false)->where('periodView.canCloseEarly', false));

        ClosingSetting::current()->update(['allow_early_weekly_close' => true]);
        $this->closeEarly()->assertSessionHasNoErrors();
        $screen()->assertInertia(fn ($page) => $page->where('periodView.closedEarly', true)->where('periodView.earlyAllowed', false)->where('periodView.status', 'approved'));
        $this->assertNotNull($payment->fresh());
    }

    public function test_the_super_admin_switches_the_early_weekly_close_on_from_the_schedule_page(): void
    {
        ClosingSetting::current()->update(['allow_early_weekly_close' => false]);

        $this->actingAs($this->admin)->put(route('settings.closing-schedule.update'), ['cutoff_time' => '00:00', 'week_starts_on' => 6, 'auto_open' => true, 'allow_early_weekly_close' => true])
            ->assertSessionHasNoErrors();

        $this->assertTrue(ClosingSetting::current()->fresh()->allow_early_weekly_close);
        $this->get(route('settings.closing-schedule.edit'))->assertInertia(fn ($page) => $page->where('setting.allow_early_weekly_close', true));
    }

    /**
     * A payment on Monday the 28th, in the week Saturday 26 Sep – Friday 2 Oct
     * (cut-off midnight at its end), with that day's closing approved.
     */
    private function weekWithOnePayment(bool $approveTheDay = true): SubscriptionTransaction
    {
        $payment = SubscriptionTransaction::recordPayment($this->subscription, $this->admin, ['amount' => '100.00', 'currency' => 'ILS', 'payment_method' => 'cash']);

        if ($approveTheDay) {
            Closing::factory()->approved()->forDay('2026-09-28')->create(['branch_id' => $this->branch->id]);
        }

        return $payment->refresh();
    }

    private function closeEarly(): TestResponse
    {
        return $this->actingAs($this->admin)->post(route('period-closings.store'), ['period' => 'weekly', 'date' => '2026-09-28', 'early' => true]);
    }

    private function userWith(PermissionKey ...$keys): User
    {
        $user = User::factory()->accountant()->create(['branch_id' => $this->branch->id]);
        $user->permissions()->sync(Permission::idsFor($keys));

        return $user;
    }

    private function assertUntouched(ClosingPeriod $before, int $closings = 1): void
    {
        $after = $before->fresh();

        $this->assertSame(ClosingPeriodStatus::Open, $after->status);
        $this->assertTrue($before->cutoff_at->equalTo($after->cutoff_at));
        $this->assertSame($before->period_end->toDateString(), $after->period_end->toDateString());
        $this->assertNull($after->scheduled_cutoff_at);
        $this->assertDatabaseCount('closing_periods', 1);
        $this->assertDatabaseCount('closings', $closings);
    }
}
