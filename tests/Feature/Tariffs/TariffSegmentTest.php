<?php

namespace Tests\Feature\Tariffs;

use App\Models\Subscriber;
use App\Models\Tariff;
use App\Models\TariffSegment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TariffSegmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_adds_a_segment_under_a_tariff(): void
    {
        $tariff = Tariff::factory()->residential()->create();

        $this->actingAs(User::factory()->superAdmin()->create())
            ->post(route('tariff-segments.store'), ['tariff_id' => $tariff->id, 'name' => 'مساجد'])
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('tariffs.index'));

        $this->assertDatabaseHas('tariff_segments', ['tariff_id' => $tariff->id, 'name' => 'مساجد']);
    }

    public function test_a_segment_name_is_rejected_twice_under_one_tariff_but_allowed_under_another(): void
    {
        $residential = Tariff::factory()->residential()->create();
        $commercial = Tariff::factory()->commercial()->create();
        TariffSegment::factory()->create(['tariff_id' => $residential->id, 'name' => 'مدارس']);
        $this->actingAs(User::factory()->superAdmin()->create());

        $this->post(route('tariff-segments.store'), ['tariff_id' => $residential->id, 'name' => 'مدارس'])
            ->assertSessionHasErrors('name');
        $this->post(route('tariff-segments.store'), ['tariff_id' => $commercial->id, 'name' => 'مدارس'])
            ->assertSessionHasNoErrors();

        $this->assertDatabaseCount('tariff_segments', 2);
    }

    public function test_renaming_a_segment_keeps_it_under_its_own_tariff(): void
    {
        $segment = TariffSegment::factory()->create(['tariff_id' => Tariff::factory()->residential(), 'name' => 'مسجد']);
        $otherTariff = Tariff::factory()->commercial()->create();

        $this->actingAs(User::factory()->superAdmin()->create())
            ->put(route('tariff-segments.update', $segment), ['tariff_id' => $otherTariff->id, 'name' => 'مساجد'])
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('tariffs.index'));

        $this->assertDatabaseHas('tariff_segments', ['id' => $segment->id, 'tariff_id' => $segment->tariff_id, 'name' => 'مساجد']);
    }

    public function test_a_branch_admin_without_tariff_permissions_cannot_add_or_rename_segments(): void
    {
        $segment = TariffSegment::factory()->create(['name' => 'مساجد']);
        $this->actingAs(User::factory()->branchAdmin()->create());

        $this->post(route('tariff-segments.store'), ['tariff_id' => $segment->tariff_id, 'name' => 'مدارس'])->assertForbidden();
        $this->put(route('tariff-segments.update', $segment), ['name' => 'مستشفيات'])->assertForbidden();

        $this->assertDatabaseHas('tariff_segments', ['id' => $segment->id, 'name' => 'مساجد']);
        $this->assertDatabaseCount('tariff_segments', 1);
    }

    public function test_the_tariffs_page_lists_each_tariffs_segments_with_their_subscriber_counts(): void
    {
        $tariff = Tariff::factory()->residential()->create();
        $segment = TariffSegment::factory()->create(['tariff_id' => $tariff->id, 'name' => 'مساجد']);
        Subscriber::factory()->count(2)->create(['tariff_id' => $tariff->id, 'tariff_segment_id' => $segment->id]);

        $this->actingAs(User::factory()->superAdmin()->create())
            ->get(route('tariffs.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('canCreateSegment', true)
                ->where('segmentGroups.0.id', $tariff->id)
                ->where('segmentGroups.0.segments.0.name', 'مساجد')
                ->where('segmentGroups.0.segments.0.subscribersCount', 2)
                ->where('segmentGroups.0.segments.0.canUpdate', true));
    }
}
