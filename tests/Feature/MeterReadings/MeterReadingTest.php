<?php

namespace Tests\Feature\MeterReadings;

use App\Enums\MeterReadingStatus;
use App\Enums\SubscriberStatus;
use App\Models\Branch;
use App\Models\MeterReading;
use App\Models\Subscriber;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MeterReadingTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;

    private User $dataEntry;

    private Subscriber $subscriber;

    protected function setUp(): void
    {
        parent::setUp();

        // Thursday 24 Sep 2026 — its reading week runs Fri 18 Sep → Thu 24 Sep.
        $this->travelTo('2026-09-24 10:00:00');

        $this->branch = Branch::factory()->create();
        $this->dataEntry = User::factory()->dataEntry()->create(['branch_id' => $this->branch->id]);
        $this->subscriber = Subscriber::factory()->create(['branch_id' => $this->branch->id, 'initial_reading' => 1200]);
    }

    public function test_data_entry_records_a_reading_without_charging_the_subscriber(): void
    {
        $this->actingAs($this->dataEntry)
            ->post(route('meter-readings.store'), [
                'subscriber_id' => $this->subscriber->id,
                'week_start' => '2026-09-22',
                'current_reading' => 1250,
            ])
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('meter-readings.index'));

        $reading = MeterReading::sole();
        $this->assertSame('2026-09-18', $reading->week_start->toDateString());
        $this->assertSame('2026-09-24', $reading->week_end->toDateString());
        $this->assertSame(1200, $reading->previous_reading);
        $this->assertSame(1250, $reading->current_reading);
        $this->assertSame(50, $reading->consumption);
        $this->assertSame(MeterReadingStatus::Pending, $reading->status);
        $this->assertSame($this->branch->id, $reading->branch_id);
        $this->assertTrue($reading->recordedBy->is($this->dataEntry));
        $this->assertDatabaseCount('subscriber_transactions', 0);
    }

    public function test_the_previous_reading_is_the_last_recorded_week(): void
    {
        $this->recordedReading('2026-09-11', 1200, 1300);

        $this->actingAs($this->dataEntry)
            ->post(route('meter-readings.store'), $this->payload(['current_reading' => 1340]))
            ->assertSessionHasNoErrors();

        $reading = MeterReading::whereDate('week_start', '2026-09-18')->sole();
        $this->assertSame(1300, $reading->previous_reading);
        $this->assertSame(40, $reading->consumption);
    }

    public function test_a_reading_cannot_be_lower_than_the_previous_reading(): void
    {
        $this->actingAs($this->dataEntry)
            ->post(route('meter-readings.store'), $this->payload(['current_reading' => 1199]))
            ->assertSessionHasErrors(['current_reading' => 'القراءة الحالية لا يمكن أن تكون أقل من القراءة السابقة (1200).']);

        $this->assertDatabaseCount('meter_readings', 0);
    }

    public function test_a_week_can_only_be_recorded_once_per_subscriber(): void
    {
        $this->recordedReading('2026-09-18', 1200, 1250);

        $this->actingAs($this->dataEntry)
            ->post(route('meter-readings.store'), $this->payload(['current_reading' => 1260]))
            ->assertSessionHasErrors(['week_start' => 'تم تسجيل قراءة لهذا المشترك في هذا الأسبوع مسبقًا.']);

        $this->assertDatabaseCount('meter_readings', 1);
    }

    public function test_a_week_before_the_latest_recorded_week_is_rejected(): void
    {
        $this->recordedReading('2026-09-18', 1200, 1250);

        $this->actingAs($this->dataEntry)
            ->post(route('meter-readings.store'), $this->payload(['week_start' => '2026-09-11']))
            ->assertSessionHasErrors(['week_start' => 'يوجد قراءة لأسبوع لاحق لهذا المشترك، لا يمكن إدخال أسبوع سابق.']);
    }

    public function test_a_future_week_is_rejected(): void
    {
        $this->actingAs($this->dataEntry)
            ->post(route('meter-readings.store'), $this->payload(['week_start' => '2026-09-25']))
            ->assertSessionHasErrors('week_start');

        $this->assertDatabaseCount('meter_readings', 0);
    }

    public function test_readings_cannot_be_recorded_for_another_branch_or_an_inactive_subscriber(): void
    {
        $otherBranchSubscriber = Subscriber::factory()->create();
        $suspendedSubscriber = Subscriber::factory()->create(['branch_id' => $this->branch->id, 'status' => SubscriberStatus::Suspended]);

        foreach ([$otherBranchSubscriber, $suspendedSubscriber] as $subscriber) {
            $this->actingAs($this->dataEntry)
                ->post(route('meter-readings.store'), $this->payload(['subscriber_id' => $subscriber->id]))
                ->assertSessionHasErrors('subscriber_id');
        }

        $this->assertDatabaseCount('meter_readings', 0);
    }

    public function test_a_collector_cannot_record_readings(): void
    {
        $collector = User::factory()->collector()->create(['branch_id' => $this->branch->id]);

        $this->actingAs($collector)
            ->post(route('meter-readings.store'), $this->payload())
            ->assertForbidden();

        $this->assertDatabaseCount('meter_readings', 0);
    }

    public function test_the_readings_list_only_shows_the_actors_branch(): void
    {
        $this->recordedReading('2026-09-18', 1200, 1250);
        MeterReading::factory()->create();

        $this->actingAs($this->dataEntry)
            ->get(route('meter-readings.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('MeterReadings/Index')
                ->has('readings.data', 1)
                ->where('readings.data.0.subscriber_id', $this->subscriber->id));
    }

    public function test_a_pending_reading_can_be_corrected(): void
    {
        $reading = $this->recordedReading('2026-09-18', 1200, 1250);

        $this->actingAs($this->dataEntry)
            ->put(route('meter-readings.update', $reading), ['current_reading' => 1235, 'notes' => 'تصحيح'])
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('meter-readings.index'));

        $reading->refresh();
        $this->assertSame(1235, $reading->current_reading);
        $this->assertSame(35, $reading->consumption);
        $this->assertSame('تصحيح', $reading->notes);
    }

    public function test_an_approved_reading_cannot_be_corrected(): void
    {
        $reading = $this->recordedReading('2026-09-18', 1200, 1250, MeterReadingStatus::Approved);

        $this->actingAs($this->dataEntry)
            ->put(route('meter-readings.update', $reading), ['current_reading' => 1235])
            ->assertForbidden();

        $this->assertSame(1250, $reading->fresh()->current_reading);
    }

    public function test_a_reading_cannot_be_corrected_once_a_later_week_exists(): void
    {
        $earlier = $this->recordedReading('2026-09-11', 1200, 1250);
        $this->recordedReading('2026-09-18', 1250, 1300);

        $this->actingAs($this->dataEntry)
            ->put(route('meter-readings.update', $earlier), ['current_reading' => 1260])
            ->assertSessionHasErrors(['current_reading' => 'لا يمكن تعديل هذه القراءة لوجود قراءة لأسبوع لاحق.']);

        $this->assertSame(1250, $earlier->fresh()->current_reading);
    }

    public function test_another_branchs_reading_cannot_be_corrected(): void
    {
        $reading = MeterReading::factory()->create();

        $this->actingAs($this->dataEntry)
            ->put(route('meter-readings.update', $reading), ['current_reading' => 999999])
            ->assertForbidden();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return [
            'subscriber_id' => $this->subscriber->id,
            'week_start' => '2026-09-18',
            'current_reading' => 1250,
            ...$overrides,
        ];
    }

    private function recordedReading(string $weekStart, int $previous, int $current, MeterReadingStatus $status = MeterReadingStatus::Pending): MeterReading
    {
        return MeterReading::factory()->create([
            'subscriber_id' => $this->subscriber->id,
            'week_start' => $weekStart,
            'week_end' => now()->parse($weekStart)->addDays(6),
            'previous_reading' => $previous,
            'current_reading' => $current,
            'consumption' => $current - $previous,
            'status' => $status,
        ]);
    }
}
