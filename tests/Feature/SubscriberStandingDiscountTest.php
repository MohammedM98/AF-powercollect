<?php

namespace Tests\Feature;

use App\Enums\DiscountMethod;
use App\Enums\MeterReadingStatus;
use App\Models\Branch;
use App\Models\MeterReading;
use App\Models\StandingDiscount;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\TariffSegment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class SubscriberStandingDiscountTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;

    private User $branchAdmin;

    private Subscriber $subscriber;

    protected function setUp(): void
    {
        parent::setUp();

        // Thursday 24 Sep 2026, a reading day — its week runs Fri 18 Sep → Thu 24 Sep.
        $this->travelTo('2026-09-24 10:00:00');

        $this->branch = Branch::factory()->create();
        $this->branchAdmin = User::factory()->branchAdmin()->create(['branch_id' => $this->branch->id, 'name' => 'Mohammed']);
        // 30 shekels a kilo, and at least 20 shekels a week.
        $this->subscriber = Subscriber::factory()->create([
            'branch_id' => $this->branch->id,
            'full_name' => 'Ahmad',
            'initial_reading' => 1200,
            'minimum_charge' => 20,
        ]);
        $this->subscriber->tariff->update(['rate' => 30]);
    }

    public function test_a_standing_discount_is_given_to_a_customer_segment_and_shown_on_the_subscribers_account(): void
    {
        $this->giveDiscount(['method' => 'kilowatt', 'value' => '3', 'segment' => 'موظفو أبو زايد', 'notes' => 'قسم الصيانة'])
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'standing-discount-saved')
            ->assertRedirect(route('subscribers.statement', $this->subscriber));

        $discount = $this->subscriber->standingDiscount()->sole();
        $this->assertSame(
            [DiscountMethod::Kilowatt, '3.00', 'موظفو أبو زايد', 'قسم الصيانة'],
            [$discount->method, $discount->value, $discount->segment, $discount->notes],
        );
        $this->assertTrue($discount->grantedBy->is($this->branchAdmin));
        $this->assertSame(
            ['action' => 'standing-discount-saved', 'subject' => 'Ahmad — 3 كيلو · موظفو أبو زايد'],
            $this->branchAdmin->notifications()->sole()->data,
        );

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('subscriber.standingDiscount.terms', '3 كيلو')
                ->where('subscriber.standingDiscount.segment', 'موظفو أبو زايد')
                ->where('subscriber.standingDiscount.notes', 'قسم الصيانة')
                ->where('subscriber.standingDiscount.grantedByName', 'Mohammed')
                ->where('subscriber.standingDiscount.grantedAt', '2026-09-24'));
        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.index'))
            ->assertInertia(fn ($page) => $page->where('subscribers.data.0.standingDiscountSummary', '3 كيلو · موظفو أبو زايد'));
    }

    public function test_free_kilowatts_are_taken_off_the_week_so_only_the_kilos_above_them_are_paid(): void
    {
        // 2 free kilos at 30 shekels a kilo; the week uses 3, so 90 shekels less 60 — even though the weekly minimum is more.
        $this->subscriber->update(['minimum_charge' => 53.54]);
        StandingDiscount::factory()->for($this->subscriber)->kilowatts(2)->create();
        $this->recordReading(1203)->assertSessionHasNoErrors();

        $reading = MeterReading::sole();
        $this->assertSame(['90.00', '60.00', '30.00'], [$reading->reading_fee, $reading->discount_amount, $reading->amount_due]);

        $this->actingAs($this->branchAdmin)
            ->post(route('meter-readings.approve'), ['reading_ids' => [$reading->id]])
            ->assertSessionHasNoErrors();

        $this->assertSame(30.0, $this->subscriber->balance());
    }

    public function test_the_discount_form_suggests_the_segments_already_given_a_discount_and_the_tariffs_segments(): void
    {
        StandingDiscount::factory()->create(['segment' => 'موظفو أبو زايد']);
        StandingDiscount::factory()->create(['segment' => 'موظفو أبو زايد']);
        TariffSegment::factory()->for($this->subscriber->tariff)->create(['name' => 'مساجد']);

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page->where('discountSegments', ['مساجد', 'موظفو أبو زايد']));
    }

    public function test_giving_a_standing_discount_again_replaces_the_one_the_subscriber_has(): void
    {
        StandingDiscount::factory()->for($this->subscriber)->percentage(10)->create(['notes' => 'مسجد']);

        $this->giveDiscount(['method' => 'shekel', 'value' => '5'])->assertSessionHasNoErrors();

        $discount = $this->subscriber->standingDiscount()->sole();
        $this->assertSame([DiscountMethod::Shekel, '5.00', null], [$discount->method, $discount->value, $discount->notes]);
        $this->assertTrue($discount->grantedBy->is($this->branchAdmin));
    }

    public function test_a_standing_discount_can_be_stopped(): void
    {
        $discount = StandingDiscount::factory()->for($this->subscriber)->kilowatts(3)->create();

        $this->actingAs($this->branchAdmin)
            ->from(route('subscribers.statement', $this->subscriber))
            ->delete(route('subscribers.standing-discount.destroy', $this->subscriber))
            ->assertSessionHas('status', 'standing-discount-stopped')
            ->assertRedirect(route('subscribers.statement', $this->subscriber));

        $this->assertModelMissing($discount);
        $this->assertSame(
            ['action' => 'standing-discount-stopped', 'subject' => 'Ahmad'],
            $this->branchAdmin->notifications()->sole()->data,
        );
    }

    /**
     * @param  array<string, string>  $input
     */
    #[TestWith([['method' => 'percentage', 'value' => '150'], 'value'])]
    #[TestWith([['method' => 'kilowatt', 'value' => '0'], 'value'])]
    #[TestWith([['method' => 'coupon', 'value' => '10'], 'method'])]
    public function test_an_invalid_standing_discount_is_rejected(array $input, string $field): void
    {
        $this->giveDiscount($input)->assertSessionHasErrors($field);

        $this->assertDatabaseCount('standing_discounts', 0);
    }

    public function test_shekels_off_the_kilo_price_cannot_be_more_than_the_price(): void
    {
        $this->giveDiscount(['method' => 'shekel', 'value' => '31'])
            ->assertSessionHasErrors(['value' => 'لا يمكن أن يزيد الخصم على سعر الكيلو (30 شيكل).']);

        $this->assertDatabaseCount('standing_discounts', 0);
    }

    public function test_a_customer_segment_longer_than_100_characters_is_rejected(): void
    {
        $this->giveDiscount(['method' => 'kilowatt', 'value' => '3', 'segment' => str_repeat('س', 101)])
            ->assertSessionHasErrors('segment');

        $this->assertDatabaseCount('standing_discounts', 0);
    }

    public function test_standing_discounts_take_the_charges_and_discounts_permission_within_the_branch(): void
    {
        $discount = StandingDiscount::factory()->for($this->subscriber)->kilowatts(3)->create();
        $dataEntry = User::factory()->dataEntry()->create(['branch_id' => $this->branch->id]);

        $this->actingAs($dataEntry)
            ->put(route('subscribers.standing-discount.update', $this->subscriber), ['method' => 'percentage', 'value' => '50'])
            ->assertForbidden();
        $this->actingAs(User::factory()->branchAdmin()->create())
            ->delete(route('subscribers.standing-discount.destroy', $this->subscriber))
            ->assertForbidden();

        $discount->refresh();
        $this->assertSame([DiscountMethod::Kilowatt, '3.00'], [$discount->method, $discount->value]);
    }

    /**
     * The example week: 5 kilos at 30 shekels a kilo, a 150 shekel bill.
     *
     * @return array<string, array{DiscountMethod, string, string, string}>
     */
    public static function discountsOnAFiveKiloWeek(): array
    {
        return [
            '3 free kilos: pays for the other 2' => [DiscountMethod::Kilowatt, '3.00', '90.00', '60.00'],
            '10% off the reading' => [DiscountMethod::Percentage, '10.00', '15.00', '135.00'],
            '5 shekels off the kilo price: 25 a kilo' => [DiscountMethod::Shekel, '5.00', '25.00', '125.00'],
        ];
    }

    #[DataProvider('discountsOnAFiveKiloWeek')]
    public function test_each_weekly_reading_is_billed_with_the_subscribers_standing_discount(
        DiscountMethod $method,
        string $value,
        string $discountAmount,
        string $amountDue,
    ): void {
        StandingDiscount::factory()->for($this->subscriber)->create(['method' => $method, 'value' => $value]);

        $this->recordReading(1205)->assertSessionHasNoErrors();

        $reading = MeterReading::sole();
        $this->assertSame([$method, $value], [$reading->discount_method, $reading->discount_value]);
        $this->assertSame(['150.00', $discountAmount, $amountDue], [$reading->reading_fee, $reading->discount_amount, $reading->amount_due]);
    }

    public function test_a_subscriber_with_a_standing_discount_pays_no_weekly_minimum(): void
    {
        StandingDiscount::factory()->for($this->subscriber)->kilowatts(3)->create();

        $this->recordReading(1202)->assertSessionHasNoErrors();

        $reading = MeterReading::sole();
        $this->assertSame(['60.00', '60.00', '0.00'], [$reading->reading_fee, $reading->discount_amount, $reading->amount_due]);
    }

    public function test_pending_discounted_readings_are_rebilled_without_the_minimum(): void
    {
        $reading = MeterReading::factory()->for($this->subscriber)->create([
            'consumption' => 3, 'unit_price' => 30, 'minimum_payment' => 53.54,
            'discount_method' => DiscountMethod::Kilowatt, 'discount_value' => 2,
            'reading_fee' => 90, 'discount_amount' => 36.46, 'amount_due' => 53.54,
        ]);
        $approved = MeterReading::factory()->approved()->for($this->subscriber)->create([
            'week_start' => '2026-09-11', 'week_end' => '2026-09-17',
            'consumption' => 3, 'unit_price' => 30, 'minimum_payment' => 53.54,
            'discount_method' => DiscountMethod::Kilowatt, 'discount_value' => 2,
            'reading_fee' => 90, 'discount_amount' => 36.46, 'amount_due' => 53.54,
        ]);

        (require database_path('migrations/2026_09_28_141413_rebill_pending_discounted_readings_without_the_minimum.php'))->up();

        $this->assertSame(['60.00', '30.00'], [$reading->fresh()->discount_amount, $reading->fresh()->amount_due]);
        $this->assertSame('53.54', $approved->fresh()->amount_due);
    }

    public function test_approving_a_discounted_reading_charges_the_full_bill_with_its_permanent_discount_as_a_transaction_of_its_own(): void
    {
        StandingDiscount::factory()->for($this->subscriber)->kilowatts(3)->create(['segment' => 'موظفو أبو زايد']);
        $this->recordReading(1205, 'عداد جديد');

        $this->actingAs($this->branchAdmin)
            ->post(route('meter-readings.approve'), ['reading_ids' => [MeterReading::sole()->id]])
            ->assertSessionHasNoErrors();

        $this->assertSame(60.0, $this->subscriber->balance());
        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->has('entries', 2)
                ->where('entries.0.description', 'قراءة أسبوعية من 2026-09-18 إلى 2026-09-24 · 5 كيلو')
                ->where('entries.0.amount', '150.00')
                ->where('entries.0.details', 'عداد جديد')
                ->where('entries.1.type', 'reading_discount')
                ->where('entries.1.typeLabel', 'خصم دائم')
                ->where('entries.1.description', 'خصم دائم · 3 كيلو مجاني · موظفو أبو زايد')
                ->where('entries.1.isCredit', true)
                ->where('entries.1.amount', '90.00')
                ->where('entries.1.details', null)
                ->where('summary.balance', '60.00')
                ->where('summary.discounted', '90.00')
                ->where('summary.discountsCount', 1)
                ->where('transactionTypes', fn ($types): bool => collect($types)->contains(['value' => 'reading_discount', 'label' => 'خصم دائم'])));
    }

    public function test_correcting_an_approved_reading_takes_its_discount_off_too_and_keeps_the_discount_it_was_recorded_with(): void
    {
        $discount = StandingDiscount::factory()->for($this->subscriber)->kilowatts(3)->create();
        $this->recordReading(1205);
        $reading = MeterReading::sole();
        $reading->approve($this->branchAdmin);
        $discount->update(['method' => DiscountMethod::Percentage, 'value' => 50]);

        $this->actingAs($this->branchAdmin)
            ->put(route('meter-readings.update', $reading), ['current_reading' => 1206])
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'meter-reading-reopened');

        // Its charge and discount stay on the statement, cancelled, and no longer count.
        $this->assertSame(2, SubscriberTransaction::whereNotNull('cancelled_at')->count());
        $this->assertSame(0.0, $this->subscriber->balance());
        $reading->refresh();
        $this->assertSame(MeterReadingStatus::Pending, $reading->status);
        // 6 kilos, 3 of them still free: 90 of 180 shekels.
        $this->assertSame(['180.00', '90.00', '90.00'], [$reading->reading_fee, $reading->discount_amount, $reading->amount_due]);
    }

    public function test_giving_a_discount_rebills_the_latest_weeks_pending_reading_at_once(): void
    {
        $this->recordReading(1205);

        $this->giveDiscount(['method' => 'kilowatt', 'value' => '3', 'segment' => 'مساجد'])->assertSessionHasNoErrors();

        $reading = MeterReading::sole();
        $this->assertSame([DiscountMethod::Kilowatt, '3.00', 'مساجد'], [$reading->discount_method, $reading->discount_value, $reading->discount_segment]);
        $this->assertSame(['150.00', '90.00', '60.00'], [$reading->reading_fee, $reading->discount_amount, $reading->amount_due]);
        $this->assertSame(MeterReadingStatus::Pending, $reading->status);
        $this->assertDatabaseCount('subscriber_transactions', 0);
    }

    public function test_a_discount_given_after_the_latest_week_was_approved_goes_to_the_transactions_at_once_and_earlier_weeks_keep_theirs(): void
    {
        $earlierWeek = MeterReading::factory()->approved()->for($this->subscriber)->create([
            'week_start' => '2026-09-11',
            'week_end' => '2026-09-17',
            'previous_reading' => 1195,
            'current_reading' => 1200,
            'consumption' => 5,
            'unit_price' => '30.00',
            'minimum_payment' => '20.00',
            'reading_fee' => '150.00',
            'amount_due' => '150.00',
        ]);
        $this->recordReading(1205);
        $latestWeek = MeterReading::whereDate('week_start', '2026-09-18')->sole();
        $latestWeek->approve($this->branchAdmin);

        $this->giveDiscount(['method' => 'kilowatt', 'value' => '3'])->assertSessionHasNoErrors();

        $discountLine = SubscriberTransaction::where('type', SubscriberTransaction::TYPE_READING_DISCOUNT)->sole();
        $this->assertSame(['-90.00', $latestWeek->id], [$discountLine->amount, $discountLine->meter_reading_id]);
        $this->assertSame(60.0, $this->subscriber->balance());
        $this->assertSame(['90.00', '60.00'], [$latestWeek->fresh()->discount_amount, $latestWeek->fresh()->amount_due]);
        $earlierWeek->refresh();
        $this->assertSame([null, '150.00'], [$earlierWeek->discount_method, $earlierWeek->amount_due]);
    }

    public function test_changing_the_discount_replaces_the_approved_latest_weeks_discount_line(): void
    {
        StandingDiscount::factory()->for($this->subscriber)->kilowatts(3)->create();
        $this->recordReading(1205);
        MeterReading::sole()->approve($this->branchAdmin);

        $this->giveDiscount(['method' => 'percentage', 'value' => '10'])->assertSessionHasNoErrors();

        $this->assertSame(['-15.00'], SubscriberTransaction::where('type', SubscriberTransaction::TYPE_READING_DISCOUNT)->whereNull('cancelled_at')->pluck('amount')->all());
        $old = SubscriberTransaction::where('type', SubscriberTransaction::TYPE_READING_DISCOUNT)->whereNotNull('cancelled_at')->sole();
        $this->assertSame(['-90.00', 'standing_discount_changed'], [$old->amount, $old->cancellation_reason->value]);
        $this->assertSame(135.0, $this->subscriber->balance());
    }

    public function test_stopping_the_discount_takes_it_off_the_latest_weeks_reading_and_the_transactions(): void
    {
        StandingDiscount::factory()->for($this->subscriber)->kilowatts(3)->create();
        $this->recordReading(1205);
        MeterReading::sole()->approve($this->branchAdmin);

        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.standing-discount.destroy', $this->subscriber))
            ->assertSessionHasNoErrors();

        $this->assertSame(0, SubscriberTransaction::where('type', SubscriberTransaction::TYPE_READING_DISCOUNT)->whereNull('cancelled_at')->count());
        $this->assertSame(1, SubscriberTransaction::where('type', SubscriberTransaction::TYPE_READING_DISCOUNT)->whereNotNull('cancelled_at')->count());
        $this->assertSame(150.0, $this->subscriber->balance());
        $reading = MeterReading::sole();
        $this->assertSame([null, '0.00', '150.00'], [$reading->discount_method, $reading->discount_amount, $reading->amount_due]);
    }

    public function test_stopping_the_discount_rebills_an_approved_week_the_minimum_now_applies_to_and_keeps_the_old_lines(): void
    {
        // 1 kilo at 30 shekels with 2 free kilos: nothing to pay; without the discount the weekly minimum of 50 is due.
        $this->subscriber->update(['minimum_charge' => 50]);
        StandingDiscount::factory()->for($this->subscriber)->kilowatts(2)->create();
        $this->recordReading(1201);
        $reading = MeterReading::sole();
        $reading->approve($this->branchAdmin);
        $this->assertSame(0.0, $this->subscriber->balance());

        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.standing-discount.destroy', $this->subscriber))
            ->assertSessionHasNoErrors();

        $this->assertSame(50.0, $this->subscriber->balance());
        $charge = SubscriberTransaction::where('type', SubscriberTransaction::TYPE_METER_READING)->whereNull('cancelled_at')->sole();
        $this->assertSame('50.00', $charge->amount);
        $this->assertNotNull($charge->corrects_id);

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.0.cancellation.wasCorrected', true)
                ->where('entries.0.cancellation.reasonLabel', 'تغيير الخصم الدائم')
                ->where('entries.1.type', 'reversal')
                ->where('entries.2.id', $charge->id)
                ->where('summary.balance', '50.00'));
    }

    public function test_the_statement_tells_the_discount_form_about_the_latest_weeks_reading(): void
    {
        $this->recordReading(1205);

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('subscriber.latestWeekReading.consumption', 5)
                ->where('subscriber.latestWeekReading.unitPrice', '30.00')
                ->where('subscriber.latestWeekReading.minimumPayment', '20.00')
                ->where('subscriber.latestWeekReading.isApproved', false));
    }

    public function test_the_reading_sheet_bills_a_row_with_its_readings_discount_or_else_the_subscribers(): void
    {
        $discount = StandingDiscount::factory()->for($this->subscriber)->kilowatts(3)->create(['segment' => 'موظفو أبو زايد']);
        $this->recordReading(1205);
        $discount->update(['method' => DiscountMethod::Percentage, 'value' => 10, 'segment' => 'مدارس']);
        $notReadYet = Subscriber::factory()->create(['branch_id' => $this->branch->id, 'full_name' => 'Basem']);
        StandingDiscount::factory()->for($notReadYet)->shekelsOffKiloPrice(5)->create(['segment' => 'مساجد']);

        $this->actingAs($this->branchAdmin)
            ->get(route('meter-readings.index'))
            ->assertInertia(fn ($page) => $page
                ->where('rows.data.0.fullName', 'Ahmad')
                ->where('rows.data.0.discount', ['method' => 'kilowatt', 'value' => '3.00', 'terms' => '3 كيلو', 'segment' => 'موظفو أبو زايد'])
                ->where('rows.data.0.reading.discountAmount', '90.00')
                ->where('rows.data.1.fullName', 'Basem')
                ->where('rows.data.1.discount', ['method' => 'shekel', 'value' => '5.00', 'terms' => '5 شيكل من سعر الكيلو', 'segment' => 'مساجد']));
    }

    /**
     * Enter the subscriber's reading for this week as the branch admin.
     */
    private function recordReading(float $currentReading, ?string $notes = null): TestResponse
    {
        return $this->actingAs($this->branchAdmin)->post(route('meter-readings.store'), [
            'subscriber_id' => $this->subscriber->id,
            'week_start' => '2026-09-18',
            'current_reading' => $currentReading,
            'notes' => $notes,
        ]);
    }

    /**
     * Give the subscriber a standing discount as the branch admin, from
     * their statement.
     *
     * @param  array<string, string>  $input
     */
    private function giveDiscount(array $input): TestResponse
    {
        return $this->actingAs($this->branchAdmin)
            ->from(route('subscribers.statement', $this->subscriber))
            ->put(route('subscribers.standing-discount.update', $this->subscriber), $input);
    }
}
