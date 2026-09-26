<?php

namespace Tests\Feature\MeterReadings;

use App\Enums\MeterReadingStatus;
use App\Enums\PermissionKey;
use App\Enums\SubscriberStatus;
use App\Models\Branch;
use App\Models\MeterBox;
use App\Models\MeterReading;
use App\Models\Permission;
use App\Models\ReadingEntrySetting;
use App\Models\SubArea;
use App\Models\Subscriber;
use App\Models\Tariff;
use App\Models\User;
use Carbon\CarbonInterface;
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
            ->from(route('subscribers.index'))
            ->post(route('meter-readings.store'), [
                'subscriber_id' => $this->subscriber->id,
                'week_start' => '2026-09-22',
                'current_reading' => 1250,
            ])
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'meter-reading-created')
            ->assertRedirect(route('subscribers.index'));

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

    public function test_the_week_is_charged_consumption_times_the_kilowatt_price(): void
    {
        $this->subscriber->tariff->update(['rate' => 0.6]);
        $this->subscriber->update(['minimum_charge' => 20]);

        $this->actingAs($this->dataEntry)
            ->post(route('meter-readings.store'), $this->payload(['current_reading' => 1250]))
            ->assertSessionHasNoErrors();

        $reading = MeterReading::sole();
        $this->assertSame('0.60', $reading->unit_price);
        $this->assertSame('30.00', $reading->reading_fee);
        $this->assertSame('20.00', $reading->minimum_payment);
        $this->assertSame('30.00', $reading->amount_due);
        $this->assertDatabaseCount('subscriber_transactions', 0);
    }

    public function test_the_minimum_payment_is_charged_when_the_reading_costs_less(): void
    {
        $this->subscriber->tariff->update(['rate' => 0.6]);
        $this->subscriber->update(['minimum_charge' => 20]);

        $this->actingAs($this->dataEntry)
            ->post(route('meter-readings.store'), $this->payload(['current_reading' => 1218]))
            ->assertSessionHasNoErrors();

        $reading = MeterReading::sole();
        $this->assertSame('10.80', $reading->reading_fee);
        $this->assertSame('20.00', $reading->amount_due);
    }

    public function test_correcting_a_reading_recalculates_its_charges_at_the_subscribers_current_price(): void
    {
        $reading = $this->recordedReading('2026-09-18', 1200, 1250);
        $reading->update(['unit_price' => 0.5, 'minimum_payment' => 10]);
        $this->subscriber->update(['minimum_charge' => 10]);
        Tariff::whereKey($this->subscriber->tariff_id)->update(['rate' => 2]);

        $this->actingAs($this->dataEntry)
            ->put(route('meter-readings.update', $reading), ['current_reading' => 1260])
            ->assertSessionHasNoErrors();

        $reading->refresh();
        $this->assertSame('2.00', $reading->unit_price);
        $this->assertSame('120.00', $reading->reading_fee);
        $this->assertSame('120.00', $reading->amount_due);
    }

    public function test_a_reading_follows_the_subscribers_new_tariff_and_minimum_until_it_is_approved(): void
    {
        $approved = $this->recordedReading('2026-09-11', 1150, 1200, MeterReadingStatus::Approved);
        $approved->update(['unit_price' => '0.50', 'reading_fee' => '25.00', 'amount_due' => '25.00']);
        $pending = $this->recordedReading('2026-09-18', 1200, 1250);
        $commercial = Tariff::factory()->commercial()->create(['rate' => '1.20']);

        $this->subscriber->update(['tariff_id' => $commercial->id, 'minimum_charge' => '70.00']);

        $pending->refresh();
        $this->assertSame(['1.20', '70.00', '60.00', '70.00'], [$pending->unit_price, $pending->minimum_payment, $pending->reading_fee, $pending->amount_due]);
        $this->assertSame(['0.50', '25.00'], [$approved->fresh()->unit_price, $approved->fresh()->amount_due]);

        $this->actingAs($this->dataEntry)
            ->get(route('meter-readings.index'))
            ->assertInertia(fn ($page) => $page
                ->where('rows.data.0.unitPrice', '1.20')
                ->where('rows.data.0.reading.amountDue', '70.00'));
    }

    public function test_a_new_kilo_price_reprices_the_readings_waiting_for_approval(): void
    {
        $pending = $this->recordedReading('2026-09-18', 1200, 1250);
        $this->subscriber->update(['minimum_charge' => '0.00']);
        $tariff = $this->subscriber->tariff;

        $this->actingAs(User::factory()->superAdmin()->create())
            ->put(route('tariffs.update', $tariff), ['category' => $tariff->category->value, 'rate' => '0.80'])
            ->assertSessionHasNoErrors();

        $pending->refresh();
        $this->assertSame('0.80', $pending->unit_price);
        $this->assertSame('40.00', $pending->amount_due);
    }

    public function test_readings_entered_before_prices_followed_the_tariff_are_brought_up_to_date(): void
    {
        $pending = $this->recordedReading('2026-09-18', 1200, 1250);
        $approved = $this->recordedReading('2026-09-11', 1150, 1200, MeterReadingStatus::Approved);
        MeterReading::query()->update(['unit_price' => '0.10', 'minimum_payment' => '0.00', 'reading_fee' => '5.00', 'amount_due' => '5.00']);
        Tariff::whereKey($this->subscriber->tariff_id)->update(['rate' => '2.00']);

        (require database_path('migrations/2026_09_26_103551_reprice_pending_meter_readings.php'))->up();

        $this->assertSame(['2.00', '100.00'], [$pending->fresh()->unit_price, $pending->fresh()->reading_fee]);
        $this->assertSame(['0.10', '5.00'], [$approved->fresh()->unit_price, $approved->fresh()->amount_due]);
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

        // Only the Super Admin may enter an earlier week at all.
        $this->actingAs(User::factory()->superAdmin()->create())
            ->post(route('meter-readings.store'), $this->payload(['week_start' => '2026-09-11']))
            ->assertSessionHasErrors(['week_start' => 'يوجد قراءة لأسبوع لاحق لهذا المشترك، لا يمكن إدخال أسبوع سابق.']);
    }

    public function test_only_the_latest_week_can_be_entered_and_earlier_weeks_are_view_only(): void
    {
        $this->actingAs($this->dataEntry)
            ->post(route('meter-readings.store'), $this->payload(['week_start' => '2026-09-11']))
            ->assertSessionHasErrors(['week_start' => 'يمكن إدخال قراءات الأسبوع الأخير فقط؛ الأسابيع السابقة للعرض فقط.']);

        $this->assertDatabaseCount('meter_readings', 0);

        $this->actingAs($this->dataEntry)
            ->get(route('meter-readings.index', ['week' => '2026-09-11']))
            ->assertInertia(fn ($page) => $page
                ->where('canRecord', true)
                ->where('weekIsViewOnly', true)
                ->where('rows.data.0.canEdit', false));

        $this->actingAs($this->dataEntry)
            ->get(route('meter-readings.index'))
            ->assertInertia(fn ($page) => $page
                ->where('weekIsViewOnly', false)
                ->where('rows.data.0.canEdit', true));
    }

    public function test_the_super_admin_can_enter_a_reading_for_an_earlier_week(): void
    {
        $this->actingAs(User::factory()->superAdmin()->create())
            ->post(route('meter-readings.store'), $this->payload(['week_start' => '2026-09-11']))
            ->assertSessionHasNoErrors();

        $this->assertSame('2026-09-11', MeterReading::sole()->week_start->toDateString());
    }

    public function test_the_sheet_stays_on_the_week_that_ended_on_thursday_when_entering_late(): void
    {
        $this->travelTo('2026-09-26 10:00:00'); // Saturday

        $this->actingAs($this->dataEntry)
            ->get(route('meter-readings.index'))
            ->assertInertia(fn ($page) => $page
                ->where('week', '2026-09-18')
                ->where('weekOptions.0.value', '2026-09-18')
                ->where('weekOptions.0.label', 'الأسبوع المنتهي في الخميس 24-09-2026'));

        $this->actingAs($this->dataEntry)
            ->get(route('meter-readings.index', ['week' => '2026-09-25']))
            ->assertInertia(fn ($page) => $page->where('week', '2026-09-18'));
    }

    public function test_a_week_that_has_not_ended_yet_is_rejected(): void
    {
        ReadingEntrySetting::factory()->forcedOpen()->create();
        $this->travelTo('2026-09-26 10:00:00'); // Saturday — the week 25 Sep → 1 Oct is still running

        $this->actingAs($this->dataEntry)
            ->post(route('meter-readings.store'), $this->payload(['week_start' => '2026-09-25']))
            ->assertSessionHasErrors(['week_start' => 'لا يمكن إدخال قراءة لأسبوع لم ينتهِ بعد.']);

        $this->assertDatabaseCount('meter_readings', 0);
    }

    public function test_the_latest_ended_week_follows_the_business_timezone(): void
    {
        config(['app.business_timezone' => 'Asia/Gaza']);

        // Wednesday 20:00 UTC is still Wednesday in Gaza: the 18 → 24 week hasn't ended.
        $this->assertSame('2026-09-11', MeterReading::latestEndedWeekStart(now()->parse('2026-09-23 20:00:00', 'UTC'))->toDateString());
        // Wednesday 22:30 UTC is already Thursday in Gaza: the 18 → 24 week ends today.
        $this->assertSame('2026-09-18', MeterReading::latestEndedWeekStart(now()->parse('2026-09-23 22:30:00', 'UTC'))->toDateString());
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

    public function test_data_entry_cannot_record_readings_outside_the_open_days(): void
    {
        ReadingEntrySetting::factory()->create(['open_days' => [CarbonInterface::THURSDAY]]);
        $this->travelTo('2026-09-22 10:00:00'); // Tuesday

        $this->actingAs($this->dataEntry)
            ->post(route('meter-readings.store'), $this->payload())
            ->assertForbidden();

        $this->actingAs($this->dataEntry)
            ->get(route('meter-readings.index'))
            ->assertInertia(fn ($page) => $page
                ->where('canRecord', false)
                ->where('entryWindow.isOpen', false)
                ->where('entryWindow.appliesToActor', true)
                ->where('entryWindow.openDays', [CarbonInterface::THURSDAY])
                ->where('rows.data.0.canEdit', false));

        $this->assertDatabaseCount('meter_readings', 0);
    }

    public function test_the_latest_weeks_readings_can_still_be_corrected_while_entry_is_closed_but_not_added(): void
    {
        $reading = $this->recordedReading('2026-09-18', 1200, 1250);
        $missing = Subscriber::factory()->create(['branch_id' => $this->branch->id]);
        ReadingEntrySetting::factory()->forcedClosed()->create();

        $this->actingAs($this->dataEntry)
            ->get(route('meter-readings.index'))
            ->assertInertia(fn ($page) => $page
                ->where('canRecord', false)
                ->where('rows.data', fn ($rows): bool => collect($rows)->pluck('canEdit', 'id')->all() == [
                    $this->subscriber->id => true,
                    $missing->id => false,
                ]));

        $this->actingAs($this->dataEntry)
            ->from(route('meter-readings.index'))
            ->put(route('meter-readings.update', $reading), ['current_reading' => 1260])
            ->assertSessionHasNoErrors();

        $this->actingAs($this->dataEntry)
            ->post(route('meter-readings.store'), $this->payload(['subscriber_id' => $missing->id]))
            ->assertForbidden();

        $this->assertSame(1260, $reading->fresh()->current_reading);
        $this->assertDatabaseCount('meter_readings', 1);
    }

    public function test_the_manual_switch_opens_entry_on_any_day(): void
    {
        ReadingEntrySetting::factory()->forcedOpen()->create(['open_days' => [CarbonInterface::THURSDAY]]);
        $this->travelTo('2026-09-21 10:00:00'); // Monday — the latest ended week is 11 → 17 Sep

        $this->actingAs($this->dataEntry)
            ->post(route('meter-readings.store'), $this->payload(['week_start' => '2026-09-11']))
            ->assertSessionHasNoErrors();

        $this->assertDatabaseCount('meter_readings', 1);
    }

    public function test_a_branch_admin_cannot_record_readings_while_entry_is_closed(): void
    {
        ReadingEntrySetting::factory()->forcedClosed()->create();
        $branchAdmin = User::factory()->branchAdmin()->create(['branch_id' => $this->branch->id]);

        $this->actingAs($branchAdmin)
            ->post(route('meter-readings.store'), $this->payload())
            ->assertForbidden();

        $this->actingAs($branchAdmin)
            ->get(route('meter-readings.index'))
            ->assertInertia(fn ($page) => $page
                ->where('entryWindow.appliesToActor', true)
                ->where('rows.data.0.canEdit', false));

        $this->assertDatabaseCount('meter_readings', 0);
    }

    public function test_the_super_admin_can_record_readings_while_entry_is_closed(): void
    {
        ReadingEntrySetting::factory()->forcedClosed()->create();

        $this->actingAs(User::factory()->superAdmin()->create())
            ->post(route('meter-readings.store'), $this->payload())
            ->assertSessionHasNoErrors();

        $this->assertDatabaseCount('meter_readings', 1);
    }

    public function test_a_collector_cannot_record_readings(): void
    {
        $collector = User::factory()->collector()->create(['branch_id' => $this->branch->id]);

        $this->actingAs($collector)
            ->post(route('meter-readings.store'), $this->payload())
            ->assertForbidden();

        $this->assertDatabaseCount('meter_readings', 0);
    }

    public function test_the_reading_sheet_lists_active_subscribers_of_the_actors_branch_with_their_last_reading(): void
    {
        $this->recordedReading('2026-09-11', 1200, 1250);
        Subscriber::factory()->create(['branch_id' => $this->branch->id, 'status' => SubscriberStatus::Suspended]);
        Subscriber::factory()->create();

        $this->actingAs($this->dataEntry)
            ->get(route('meter-readings.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('MeterReadings/Index')
                ->where('week', '2026-09-18')
                ->has('rows.data', 1)
                ->where('rows.data.0.id', $this->subscriber->id)
                ->where('rows.data.0.previousReading', 1250)
                ->where('rows.data.0.reading', null)
                ->where('rows.data.0.canEdit', true)
                ->where('summary.total', 1)
                ->where('summary.entered', 0));
    }

    public function test_the_reading_sheet_passes_on_the_saved_status_for_the_success_message(): void
    {
        $this->actingAs($this->dataEntry)
            ->withSession(['status' => 'meter-reading-created'])
            ->get(route('meter-readings.index'))
            ->assertInertia(fn ($page) => $page->where('status', 'meter-reading-created'));
    }

    public function test_the_reading_sheet_can_show_only_subscribers_still_missing_this_weeks_reading(): void
    {
        $this->recordedReading('2026-09-18', 1200, 1250);
        $missing = Subscriber::factory()->create(['branch_id' => $this->branch->id]);

        $this->actingAs($this->dataEntry)
            ->get(route('meter-readings.index', ['filter' => ['entry' => 'missing']]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('rows.data', 1)
                ->where('rows.data.0.id', $missing->id)
                ->where('summary.entered', 1));
    }

    public function test_the_reading_sheet_sorts_by_the_weeks_computed_reading_columns(): void
    {
        $this->recordedReading('2026-09-18', 1200, 1290);
        $lowUsage = Subscriber::factory()->create(['branch_id' => $this->branch->id, 'initial_reading' => 5000, 'full_name' => 'Aaa']);
        MeterReading::factory()->create([
            'subscriber_id' => $lowUsage->id,
            'week_start' => '2026-09-18',
            'week_end' => '2026-09-24',
            'previous_reading' => 5000,
            'current_reading' => 5010,
            'consumption' => 10,
        ]);
        $notEntered = Subscriber::factory()->create(['branch_id' => $this->branch->id, 'initial_reading' => 300, 'full_name' => 'Zzz']);

        $sortedIds = fn (string $sort, string $direction) => $this->actingAs($this->dataEntry)
            ->get(route('meter-readings.index', ['sort' => $sort, 'direction' => $direction]))
            ->assertOk()
            ->viewData('page')['props']['rows']['data'];

        $this->assertSame(
            [$this->subscriber->id, $lowUsage->id],
            array_slice(array_column($sortedIds('consumption', 'desc'), 'id'), 0, 2),
        );
        $this->assertSame(
            [$notEntered->id, $this->subscriber->id, $lowUsage->id],
            array_column($sortedIds('last_reading', 'asc'), 'id'),
        );
    }

    public function test_the_reading_sheet_filters_by_the_meter_boxs_sub_area(): void
    {
        $subArea = SubArea::factory()->create();
        $inSubArea = Subscriber::factory()->create([
            'branch_id' => $this->branch->id,
            'meter_box_id' => MeterBox::factory()->create(['branch_id' => $this->branch->id, 'sub_area_id' => $subArea->id])->id,
        ]);

        $this->actingAs($this->dataEntry)
            ->get(route('meter-readings.index', ['filter' => ['sub_area_id' => $subArea->id]]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('rows.data', 1)
                ->where('rows.data.0.id', $inSubArea->id));
    }

    public function test_the_subscriber_statement_includes_their_readings(): void
    {
        $this->recordedReading('2026-09-11', 1200, 1250, MeterReadingStatus::Approved);
        $this->recordedReading('2026-09-18', 1250, 1290);

        $this->actingAs($this->dataEntry)
            ->get(route('subscribers.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('subscribers.data.0.id', $this->subscriber->id)
                ->where('subscribers.data.0.lastReading', 1290)
                ->where('subscribers.data.0.lastReadingWeekStart', '2026-09-18')
                ->where('subscribers.data.0.canRecordReading', true)
                ->has('subscribers.data.0.meterReadings', 2)
                ->where('subscribers.data.0.meterReadings.0.weekStart', '2026-09-18')
                ->where('subscribers.data.0.meterReadings.0.consumption', 40)
                ->where('subscribers.data.0.meterReadings.0.canUpdate', true)
                ->where('subscribers.data.0.meterReadings.1.canUpdate', false)
                ->has('readingWeekOptions', 1)
                ->where('readingWeekOptions.0.value', '2026-09-18'));
    }

    public function test_a_collector_is_not_offered_reading_entry_on_the_statement(): void
    {
        $collector = User::factory()->collector()->create(['branch_id' => $this->branch->id]);
        $collector->permissions()->attach(
            Permission::firstOrCreate(
                ['key' => PermissionKey::ViewSubscribers->value],
                ['label' => PermissionKey::ViewSubscribers->label()],
            ),
        );

        $this->actingAs($collector)
            ->get(route('subscribers.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('subscribers.data.0.canRecordReading', false));
    }

    public function test_a_pending_reading_can_be_corrected(): void
    {
        $reading = $this->recordedReading('2026-09-18', 1200, 1250);

        $this->actingAs($this->dataEntry)
            ->from(route('meter-readings.index'))
            ->put(route('meter-readings.update', $reading), ['current_reading' => 1235, 'notes' => 'تصحيح'])
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('meter-readings.index'));

        $reading->refresh();
        $this->assertSame(1235, $reading->current_reading);
        $this->assertSame(35, $reading->consumption);
        $this->assertSame('تصحيح', $reading->notes);
    }

    public function test_an_approved_reading_of_an_earlier_week_cannot_be_corrected(): void
    {
        $reading = $this->recordedReading('2026-09-11', 1200, 1250, MeterReadingStatus::Approved);

        $this->actingAs($this->dataEntry)
            ->put(route('meter-readings.update', $reading), ['current_reading' => 1235])
            ->assertForbidden();

        $this->assertSame(1250, $reading->fresh()->current_reading);
    }

    public function test_a_reading_cannot_be_corrected_once_a_later_week_exists(): void
    {
        $earlier = $this->recordedReading('2026-09-11', 1200, 1250);
        $this->recordedReading('2026-09-18', 1250, 1300);

        // Only the Super Admin may correct an earlier week at all.
        $this->actingAs(User::factory()->superAdmin()->create())
            ->put(route('meter-readings.update', $earlier), ['current_reading' => 1260])
            ->assertSessionHasErrors(['current_reading' => 'لا يمكن تعديل هذه القراءة لوجود قراءة لأسبوع لاحق.']);

        $this->assertSame(1250, $earlier->fresh()->current_reading);
    }

    public function test_a_reading_from_an_earlier_week_cannot_be_corrected_even_by_a_branch_admin(): void
    {
        $reading = $this->recordedReading('2026-09-11', 1200, 1250);
        $branchAdmin = User::factory()->branchAdmin()->create(['branch_id' => $this->branch->id]);

        $this->actingAs($branchAdmin)
            ->put(route('meter-readings.update', $reading), ['current_reading' => 1260])
            ->assertForbidden();

        $this->assertSame(1250, $reading->fresh()->current_reading);
    }

    public function test_the_super_admin_can_correct_a_reading_from_an_earlier_week(): void
    {
        $reading = $this->recordedReading('2026-09-11', 1200, 1250);

        $this->actingAs(User::factory()->superAdmin()->create())
            ->put(route('meter-readings.update', $reading), ['current_reading' => 1260])
            ->assertSessionHasNoErrors();

        $this->assertSame(1260, $reading->fresh()->current_reading);
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
