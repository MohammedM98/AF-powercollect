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
        $this->actingAs(User::factory()->superAdmin()->create())
            ->get(route('settings.reading-schedule.edit'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Settings/ReadingSchedule')
                ->where('setting.open_days', [CarbonInterface::THURSDAY])
                ->where('setting.mode', 'automatic'));
    }

    public function test_super_admin_can_change_the_open_days_and_mode(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $this->actingAs($superAdmin)
            ->put(route('settings.reading-schedule.update'), [
                'open_days' => [CarbonInterface::WEDNESDAY, CarbonInterface::THURSDAY],
                'mode' => 'closed',
            ])
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('settings.reading-schedule.edit'));

        $setting = ReadingEntrySetting::sole();
        $this->assertSame([CarbonInterface::WEDNESDAY, CarbonInterface::THURSDAY], $setting->open_days);
        $this->assertSame(ReadingEntryMode::Closed, $setting->mode);
        $this->assertTrue($setting->updatedBy->is($superAdmin));
    }

    public function test_at_least_one_open_day_is_required(): void
    {
        $this->actingAs(User::factory()->superAdmin()->create())
            ->put(route('settings.reading-schedule.update'), ['open_days' => [], 'mode' => 'automatic'])
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
}
