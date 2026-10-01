<?php

namespace Tests\Feature\Settings;

use App\Enums\ReadingEntryMode;
use App\Models\ReadingEntrySetting;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReadingScheduleTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_sees_the_schedule_defaulting_to_thursday(): void
    {
        $this->travelTo('2026-09-25 10:00:00'); // Friday

        $this->actingAs(User::factory()->superAdmin()->create())
            ->get(route('settings.reading-schedule.edit'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Settings/ReadingSchedule')
                ->where('setting.reading_day', CarbonInterface::THURSDAY)
                ->where('setting.latestWeekEnd', '2026-09-24')
                ->where('setting.open_days', [CarbonInterface::THURSDAY])
                ->where('setting.mode', 'automatic')
                ->where('setting.opens_at', '00:00')
                ->where('setting.closes_at', '23:59')
                ->where('currentWeeks.'.CarbonInterface::SATURDAY, ['start' => '2026-09-25', 'end' => '2026-09-26'])
                ->where('firstWeeks.'.CarbonInterface::SATURDAY, ['start' => '2026-09-25', 'end' => '2026-09-26']));
    }

    public function test_super_admin_can_change_the_open_days_and_mode(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $this->actingAs($superAdmin)
            ->put(route('settings.reading-schedule.update'), [
                'reading_day' => CarbonInterface::THURSDAY,
                'open_days' => [CarbonInterface::WEDNESDAY, CarbonInterface::THURSDAY],
                'mode' => 'closed',
            ])
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('settings.reading-schedule.edit'));

        $setting = ReadingEntrySetting::sole();
        $this->assertSame([CarbonInterface::WEDNESDAY, CarbonInterface::THURSDAY], $setting->open_days);
        $this->assertSame(ReadingEntryMode::Closed, $setting->mode);
        $this->assertTrue($setting->updatedBy->is($superAdmin));
        $this->assertSame(CarbonInterface::THURSDAY, $setting->reading_day);
        $this->assertNull($setting->reading_day_history);
    }

    public function test_moving_the_reading_day_keeps_the_ended_weeks_and_starts_the_first_new_week_after_them(): void
    {
        $this->travelTo('2026-09-30 10:00:00'); // Wednesday — the latest ended week is 18 → 24 Sep

        $this->actingAs(User::factory()->superAdmin()->create())
            ->put(route('settings.reading-schedule.update'), [
                'reading_day' => CarbonInterface::SATURDAY,
                'open_days' => [CarbonInterface::SATURDAY],
                'mode' => 'automatic',
            ])
            ->assertSessionHasNoErrors();

        $setting = ReadingEntrySetting::sole();
        $this->assertSame(CarbonInterface::SATURDAY, $setting->reading_day);
        // The first Saturday week runs from 25 Sep to the coming Saturday.
        $this->assertSame(
            [['reading_day' => CarbonInterface::THURSDAY, 'last_week_end' => '2026-09-24', 'next_week_end' => '2026-10-03']],
            $setting->reading_day_history,
        );
    }

    public function test_moving_the_reading_day_again_before_a_week_ends_on_it_replaces_the_earlier_move(): void
    {
        $this->travelTo('2026-09-25 10:00:00'); // Friday
        $setting = ReadingEntrySetting::factory()->create();

        $setting->changeReadingDay(CarbonInterface::SATURDAY);
        $setting->changeReadingDay(CarbonInterface::FRIDAY);

        $this->assertSame(CarbonInterface::FRIDAY, $setting->reading_day);
        $this->assertSame(
            [['reading_day' => CarbonInterface::THURSDAY, 'last_week_end' => '2026-09-24', 'next_week_end' => '2026-09-25']],
            $setting->reading_day_history,
        );
    }

    public function test_moving_the_reading_day_back_before_a_week_ends_on_the_new_day_undoes_the_move(): void
    {
        $this->travelTo('2026-09-25 10:00:00'); // Friday
        $setting = ReadingEntrySetting::factory()->create();

        $setting->changeReadingDay(CarbonInterface::SATURDAY);
        $setting->changeReadingDay(CarbonInterface::THURSDAY);

        $this->assertSame(CarbonInterface::THURSDAY, $setting->reading_day);
        $this->assertSame([], $setting->reading_day_history);
    }

    public function test_the_reading_day_is_required_and_must_be_a_day_of_the_week(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $this->actingAs($superAdmin)
            ->put(route('settings.reading-schedule.update'), ['open_days' => [4], 'mode' => 'automatic'])
            ->assertSessionHasErrors(['reading_day' => 'اختر يوم القراءة الأسبوعي.']);

        $this->actingAs($superAdmin)
            ->put(route('settings.reading-schedule.update'), ['reading_day' => 7, 'open_days' => [4], 'mode' => 'automatic'])
            ->assertSessionHasErrors('reading_day');

        $this->assertDatabaseCount('reading_entry_settings', 0);
    }

    public function test_at_least_one_open_day_is_required(): void
    {
        $this->actingAs(User::factory()->superAdmin()->create())
            ->put(route('settings.reading-schedule.update'), ['reading_day' => 4, 'open_days' => [], 'mode' => 'automatic'])
            ->assertSessionHasErrors(['open_days' => 'اختر يومًا واحدًا على الأقل لفتح الإدخال.']);
    }

    public function test_branch_admin_cannot_manage_the_company_wide_schedule(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();

        $this->actingAs($branchAdmin)->get(route('settings.reading-schedule.edit'))->assertForbidden();
        $this->actingAs($branchAdmin)
            ->put(route('settings.reading-schedule.update'), ['open_days' => [1], 'mode' => 'open'])
            ->assertForbidden();

        $this->assertDatabaseMissing('reading_entry_settings', ['mode' => 'open']);
    }

    public function test_scheduled_days_follow_the_business_timezone(): void
    {
        config(['app.business_timezone' => 'Asia/Gaza']);
        $setting = ReadingEntrySetting::factory()->create(['open_days' => [CarbonInterface::THURSDAY]]);

        // Wednesday 22:30 UTC is already Thursday 01:30 in Gaza.
        $this->assertTrue($setting->isOpen(now()->parse('2026-09-23 22:30:00', 'UTC')));
        // Thursday 22:30 UTC is already Friday in Gaza.
        $this->assertFalse($setting->isOpen(now()->parse('2026-09-24 22:30:00', 'UTC')));
    }

    public function test_entry_hours_are_saved_and_returned_on_the_schedule_page(): void
    {
        $this->actingAs(User::factory()->superAdmin()->create())
            ->put(route('settings.reading-schedule.update'), [
                'reading_day' => CarbonInterface::THURSDAY,
                'open_days' => [CarbonInterface::THURSDAY],
                'mode' => 'automatic',
                'opens_at' => '08:30',
                'closes_at' => '17:00',
            ])
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('settings.reading-schedule.edit'));

        $setting = ReadingEntrySetting::sole();
        $this->assertSame('08:30', substr($setting->opens_at, 0, 5));
        $this->assertSame('17:00', substr($setting->closes_at, 0, 5));
        $this->get(route('settings.reading-schedule.edit'))
            ->assertInertia(fn ($page) => $page->where('setting.opens_at', '08:30')->where('setting.closes_at', '17:00'));
    }

    public function test_invalid_incomplete_and_reversed_entry_hours_do_not_change_the_schedule(): void
    {
        $setting = ReadingEntrySetting::factory()->create(['opens_at' => '08:30:00', 'closes_at' => '17:00:00']);
        $this->actingAs(User::factory()->superAdmin()->create());
        $schedule = ['reading_day' => 4, 'open_days' => [4], 'mode' => 'automatic'];

        foreach ([
            [['opens_at' => '25:00', 'closes_at' => '17:00'], 'opens_at'],
            [['opens_at' => '08:30', 'closes_at' => '24:00'], 'closes_at'],
            [['opens_at' => '08:30', 'closes_at' => '08:30'], 'closes_at'],
            [['opens_at' => '17:00', 'closes_at' => '08:30'], 'closes_at'],
            [['opens_at' => '08:30'], 'closes_at'],
            [['closes_at' => '17:00'], 'opens_at'],
            [['opens_at' => '', 'closes_at' => ''], ['opens_at', 'closes_at']],
        ] as [$hours, $errors]) {
            $this->put(route('settings.reading-schedule.update'), $schedule + $hours)->assertSessionHasErrors($errors);
        }

        $this->assertSame('08:30', substr($setting->fresh()->opens_at, 0, 5));
        $this->assertSame('17:00', substr($setting->fresh()->closes_at, 0, 5));
    }

    public function test_existing_schedule_updates_without_hours_keep_the_saved_window(): void
    {
        $setting = ReadingEntrySetting::factory()->create(['opens_at' => '08:30:00', 'closes_at' => '17:00:00']);
        $this->actingAs(User::factory()->superAdmin()->create())
            ->put(route('settings.reading-schedule.update'), ['reading_day' => 4, 'open_days' => [4], 'mode' => 'open'])
            ->assertSessionHasNoErrors();

        $this->assertSame('08:30', substr($setting->fresh()->opens_at, 0, 5));
        $this->assertSame('17:00', substr($setting->fresh()->closes_at, 0, 5));
    }

    public function test_automatic_entry_includes_both_boundary_minutes_in_the_business_timezone(): void
    {
        config(['app.business_timezone' => 'Asia/Gaza']);
        $setting = ReadingEntrySetting::factory()->create(['opens_at' => '08:30:00', 'closes_at' => '17:00:00']);

        $this->assertFalse($setting->isOpen(now()->parse('2026-09-24 05:29:59', 'UTC')));
        $this->assertTrue($setting->isOpen(now()->parse('2026-09-24 05:30:00', 'UTC')));
        $this->assertTrue($setting->isOpen(now()->parse('2026-09-24 14:00:59', 'UTC')));
        $this->assertFalse($setting->isOpen(now()->parse('2026-09-24 14:01:00', 'UTC')));
        $this->assertFalse($setting->isOpen(now()->parse('2026-09-25 05:30:00', 'UTC')));
    }

    public function test_default_hours_cover_the_whole_day_and_manual_modes_override_hours(): void
    {
        config(['app.business_timezone' => 'Asia/Gaza']);
        $setting = ReadingEntrySetting::factory()->create();
        $this->assertTrue($setting->isOpen(now()->parse('2026-09-24 00:00:00', 'Asia/Gaza')));
        $this->assertTrue($setting->isOpen(now()->parse('2026-09-24 23:59:59', 'Asia/Gaza')));

        $setting->opens_at = '08:30:00';
        $setting->closes_at = '17:00:00';
        $setting->mode = ReadingEntryMode::Open;
        $this->assertTrue($setting->isOpen(now()->parse('2026-09-25 03:00:00', 'Asia/Gaza')));
        $setting->mode = ReadingEntryMode::Closed;
        $this->assertFalse($setting->isOpen(now()->parse('2026-09-24 10:00:00', 'Asia/Gaza')));
    }
}
