<?php

namespace Tests\Feature\MeterReadings;

use App\Models\Branch;
use App\Models\MeterReading;
use App\Models\MobileAccessToken;
use App\Models\ReadingEntrySetting;
use App\Models\Subscription;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Each branch reads on its own weekly reading day, so the weeks the sheet, the
 * entry form, the mobile app and the messages follow are the user's branch's.
 */
class BranchReadingWeeksTest extends TestCase
{
    use RefreshDatabase;

    /** Follows the company's schedule: weeks end on Thursday. */
    private Branch $thursdays;

    /** Has its own schedule: weeks end on Saturday, with entry forced open. */
    private Branch $saturdays;

    protected function setUp(): void
    {
        parent::setUp();

        // Thursday 24 Sep 2026: the Thursday branch's week 18 → 24 Sep ends today; the Saturday branch's 13 → 19 Sep ended last Saturday.
        $this->travelTo('2026-09-24 10:00:00');

        $this->thursdays = Branch::factory()->create(['name' => 'Beta']);
        $this->saturdays = Branch::factory()->create(['name' => 'Alpha']);
        ReadingEntrySetting::factory()->forBranch($this->saturdays)->forcedOpen()->create(['reading_day' => CarbonInterface::SATURDAY]);
    }

    public function test_the_sheet_opens_on_the_latest_week_of_the_users_branch(): void
    {
        $this->actingAs($this->staff($this->thursdays))->get(route('meter-readings.index'))->assertInertia(fn ($page) => $page
            ->where('week', '2026-09-18')
            ->where('weekEnd', '2026-09-24')
            ->where('weekOptions.0.value', '2026-09-18'));

        $this->actingAs($this->staff($this->saturdays))->get(route('meter-readings.index'))->assertInertia(fn ($page) => $page
            ->where('week', '2026-09-13')
            ->where('weekEnd', '2026-09-19')
            ->where('weekOptions.0.value', '2026-09-13'));
    }

    public function test_a_reading_is_recorded_in_the_week_of_its_subscriptions_branch(): void
    {
        $subscription = Subscription::factory()->create(['branch_id' => $this->saturdays->id, 'initial_reading' => 100]);

        $this->actingAs($this->staff($this->saturdays))
            ->post(route('meter-readings.store'), ['subscription_id' => $subscription->id, 'week_start' => '2026-09-19', 'current_reading' => 130])
            ->assertSessionHasNoErrors();

        $reading = MeterReading::sole();
        $this->assertSame('2026-09-13', $reading->week_start->toDateString());
        $this->assertSame('2026-09-19', $reading->week_end->toDateString());
    }

    public function test_a_week_that_has_not_ended_in_the_branch_is_refused_although_it_has_in_another(): void
    {
        $saturdaySubscription = Subscription::factory()->create(['branch_id' => $this->saturdays->id, 'initial_reading' => 100]);
        $thursdaySubscription = Subscription::factory()->create(['branch_id' => $this->thursdays->id, 'initial_reading' => 100]);
        $today = ['week_start' => '2026-09-24', 'current_reading' => 150];

        // Thursday 24 Sep is inside the Saturday branch's week 20 → 26 Sep, still under way; it ends the Thursday branch's.
        $this->actingAs($this->staff($this->saturdays))
            ->post(route('meter-readings.store'), ['subscription_id' => $saturdaySubscription->id, ...$today])
            ->assertSessionHasErrors(['week_start' => 'لا يمكن إدخال قراءة لأسبوع لم ينتهِ بعد.']);
        $this->actingAs($this->staff($this->thursdays))
            ->post(route('meter-readings.store'), ['subscription_id' => $thursdaySubscription->id, ...$today])
            ->assertSessionHasNoErrors();

        $this->assertSame([$thursdaySubscription->id], MeterReading::pluck('subscription_id')->all());
    }

    public function test_only_the_latest_week_of_the_branch_takes_new_readings(): void
    {
        $subscription = Subscription::factory()->create(['branch_id' => $this->saturdays->id, 'initial_reading' => 100]);

        $this->actingAs($this->staff($this->saturdays))
            ->post(route('meter-readings.store'), ['subscription_id' => $subscription->id, 'week_start' => '2026-09-10', 'current_reading' => 150])
            ->assertSessionHasErrors('week_start');

        $this->assertSame(0, MeterReading::count());
    }

    public function test_the_super_admins_sheet_is_held_to_one_branch_when_the_branches_read_on_different_weeks(): void
    {
        $this->actingAs(User::factory()->superAdmin()->create())->get(route('meter-readings.index'))->assertInertia(fn ($page) => $page
            // Alpha, the first by name, reads on Saturdays.
            ->where('filters.filter.branch_id', (string) $this->saturdays->id)
            ->where('week', '2026-09-13'));

        $this->get(route('meter-readings.index', ['filter' => ['branch_id' => $this->thursdays->id]]))->assertInertia(fn ($page) => $page
            ->where('filters.filter.branch_id', (string) $this->thursdays->id)
            ->where('week', '2026-09-18'));
    }

    public function test_the_super_admins_sheet_covers_every_branch_while_they_read_on_the_same_weeks(): void
    {
        ReadingEntrySetting::ownFor($this->saturdays)->delete();

        $this->actingAs(User::factory()->superAdmin()->create())->get(route('meter-readings.index'))->assertInertia(fn ($page) => $page
            ->where('filters.filter', [])
            ->where('week', '2026-09-18'));
    }

    public function test_the_mobile_roster_carries_the_week_of_the_users_branch(): void
    {
        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($this->staff($this->saturdays)));
        $this->getJson(route('mobile.subscriptions.index'))
            ->assertOk()
            ->assertJsonPath('week_start', '2026-09-13')
            ->assertJsonPath('week_end', '2026-09-19')
            ->assertJsonPath('can_record_readings_now', true);

        $this->getJson(route('mobile.readings.index'))
            ->assertOk()
            ->assertJsonPath('week_start', '2026-09-13')
            ->assertJsonPath('week_options.0.value', '2026-09-13');

        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($this->staff($this->thursdays)));
        $this->getJson(route('mobile.subscriptions.index'))->assertJsonPath('week_start', '2026-09-18');
    }

    public function test_the_subscriptions_page_lists_the_weeks_of_each_branch_the_user_may_enter_readings_for(): void
    {
        $this->actingAs(User::factory()->superAdmin()->create())->get(route('subscriptions.index'))->assertInertia(fn ($page) => $page
            ->where('readingWeekOptions.'.$this->saturdays->id.'.0.value', '2026-09-13')
            ->where('readingWeekOptions.'.$this->thursdays->id.'.0.value', '2026-09-18')
            ->has('readingWeekOptions.'.$this->saturdays->id, 8));

        $this->actingAs($this->staff($this->saturdays))->get(route('subscriptions.index'))->assertInertia(fn ($page) => $page
            ->has('readingWeekOptions', 1)
            ->has('readingWeekOptions.'.$this->saturdays->id, 1)
            ->where('readingWeekOptions.'.$this->saturdays->id.'.0.value', '2026-09-13'));
    }

    public function test_a_message_about_a_weekly_reading_starts_on_the_branchs_latest_week(): void
    {
        $this->actingAs(User::factory()->branchAdmin()->create(['branch_id' => $this->saturdays->id]))
            ->get(route('messages.create', ['kind' => 'weekly_reading']))
            ->assertInertia(fn ($page) => $page
                ->where('criteria.week_start', '2026-09-13')
                ->where('weekBranchId', $this->saturdays->id)
                ->where('weekOptions.'.$this->saturdays->id.'.0.value', '2026-09-13'));

        $this->actingAs(User::factory()->superAdmin()->create());
        $this->get(route('messages.create', ['kind' => 'weekly_reading']))->assertInertia(fn ($page) => $page
            ->where('weekBranchId', $this->saturdays->id)
            ->where('criteria.week_start', '2026-09-13')
            ->where('weekOptions.'.$this->thursdays->id.'.0.value', '2026-09-18'));
        $this->get(route('messages.create', ['kind' => 'weekly_reading', 'branch_id' => $this->thursdays->id]))
            ->assertInertia(fn ($page) => $page->where('criteria.week_start', '2026-09-18'));
    }

    private function staff(Branch $branch): User
    {
        return User::factory()->dataEntry()->create(['branch_id' => $branch->id]);
    }
}
