<?php

namespace Tests\Feature;

use App\Enums\DiscountMethod;
use App\Enums\MeterReadingStatus;
use App\Models\Branch;
use App\Models\MeterReading;
use App\Models\StandingDiscount;
use App\Models\Subscriber;
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

    public function test_a_standing_discount_is_given_to_the_subscriber_and_shown_on_their_account(): void
    {
        $this->giveDiscount(['method' => 'kilowatt', 'value' => '3', 'notes' => 'موظف في الشركة'])
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'standing-discount-saved')
            ->assertRedirect(route('subscribers.statement', $this->subscriber));

        $discount = $this->subscriber->standingDiscount()->sole();
        $this->assertSame([DiscountMethod::Kilowatt, '3.00', 'موظف في الشركة'], [$discount->method, $discount->value, $discount->notes]);
        $this->assertTrue($discount->grantedBy->is($this->branchAdmin));
        $this->assertSame(
            ['action' => 'standing-discount-saved', 'subject' => 'Ahmad — 3 كيلو'],
            $this->branchAdmin->notifications()->sole()->data,
        );

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('subscriber.standingDiscount.terms', '3 كيلو')
                ->where('subscriber.standingDiscount.notes', 'موظف في الشركة')
                ->where('subscriber.standingDiscount.grantedByName', 'Mohammed')
                ->where('subscriber.standingDiscount.grantedAt', '2026-09-24'));
        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.index'))
            ->assertInertia(fn ($page) => $page->where('subscribers.data.0.standingDiscountTerms', '3 كيلو'));
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

    public function test_the_weekly_minimum_is_still_due_when_the_discount_leaves_less(): void
    {
        StandingDiscount::factory()->for($this->subscriber)->kilowatts(3)->create();

        $this->recordReading(1202)->assertSessionHasNoErrors();

        $reading = MeterReading::sole();
        $this->assertSame(['60.00', '40.00', '20.00'], [$reading->reading_fee, $reading->discount_amount, $reading->amount_due]);
    }

    public function test_approving_a_discounted_reading_charges_the_full_bill_with_the_discount_beside_it(): void
    {
        StandingDiscount::factory()->for($this->subscriber)->kilowatts(3)->create();
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
                ->where('entries.1.description', 'خصم دائم على القراءة الأسبوعية: 3 كيلو')
                ->where('entries.1.typeLabel', 'خصم')
                ->where('entries.1.isCredit', true)
                ->where('entries.1.amount', '90.00')
                ->where('entries.1.details', null)
                ->where('summary.balance', '60.00')
                ->where('summary.discounted', '90.00'));
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

        $this->assertDatabaseCount('subscriber_transactions', 0);
        $reading->refresh();
        $this->assertSame(MeterReadingStatus::Pending, $reading->status);
        // 6 kilos, 3 of them still free: 90 of 180 shekels.
        $this->assertSame(['180.00', '90.00', '90.00'], [$reading->reading_fee, $reading->discount_amount, $reading->amount_due]);
    }

    public function test_the_reading_sheet_bills_a_row_with_its_readings_discount_or_else_the_subscribers(): void
    {
        $discount = StandingDiscount::factory()->for($this->subscriber)->kilowatts(3)->create();
        $this->recordReading(1205);
        $discount->update(['method' => DiscountMethod::Percentage, 'value' => 10]);
        $notReadYet = Subscriber::factory()->create(['branch_id' => $this->branch->id, 'full_name' => 'Basem']);
        StandingDiscount::factory()->for($notReadYet)->shekelsOffKiloPrice(5)->create();

        $this->actingAs($this->branchAdmin)
            ->get(route('meter-readings.index'))
            ->assertInertia(fn ($page) => $page
                ->where('rows.data.0.fullName', 'Ahmad')
                ->where('rows.data.0.discount', ['method' => 'kilowatt', 'value' => '3.00', 'terms' => '3 كيلو'])
                ->where('rows.data.0.reading.discountAmount', '90.00')
                ->where('rows.data.1.fullName', 'Basem')
                ->where('rows.data.1.discount', ['method' => 'shekel', 'value' => '5.00', 'terms' => '5 شيكل من سعر الكيلو']));
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
