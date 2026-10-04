<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class SubscriberChargesAndDiscountsTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;

    private User $branchAdmin;

    private Subscriber $subscriber;

    protected function setUp(): void
    {
        parent::setUp();

        $this->branch = Branch::factory()->create();
        $this->branchAdmin = User::factory()->branchAdmin()->create(['branch_id' => $this->branch->id]);
        $this->subscriber = Subscriber::factory()->create(['branch_id' => $this->branch->id, 'full_name' => 'Ahmad']);
    }

    public function test_a_charge_raises_the_balance_and_shows_its_type_and_details_on_the_statement(): void
    {
        $this->postAs($this->branchAdmin, route('subscribers.charges.store', $this->subscriber), ['type' => 'penalty', 'amount' => '50', 'notes' => 'تأخر في السداد'])
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'charge-recorded')
            ->assertRedirect(route('subscribers.statement', $this->subscriber));

        $charge = SubscriberTransaction::sole();
        $this->assertSame(['penalty', '50.00', 'تأخر في السداد'], [$charge->type, $charge->amount, $charge->notes]);
        $this->assertSame(
            ['action' => 'charge-recorded', 'subject' => 'Ahmad — غرامة مالية 50 شيكل'],
            $this->branchAdmin->notifications()->sole()->data,
        );

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.0.typeLabel', 'غرامة مالية')
                ->where('entries.0.description', 'غرامة مالية')
                ->where('entries.0.details', 'تأخر في السداد')
                ->where('entries.0.isCredit', false)
                ->where('summary.balance', '50.00')
                ->where('canAdjustBalance', true));
    }

    public function test_a_penalty_must_say_why_and_the_form_suggests_the_usual_disconnection_fee(): void
    {
        $this->postAs($this->branchAdmin, route('subscribers.charges.store', $this->subscriber), ['type' => 'penalty', 'amount' => '50', 'notes' => ''])
            ->assertSessionHasErrors(['notes' => 'اكتب سبب الغرامة؛ يظهر في كشف حساب المشترك.']);
        $this->postAs($this->branchAdmin, route('subscribers.charges.store', $this->subscriber), ['type' => 'disconnection_fee', 'amount' => '50'])
            ->assertSessionHasNoErrors();

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->has('chargeTypes', 3)
                ->where('chargeTypes.0', ['value' => 'penalty', 'label' => 'غرامة مالية', 'usualAmount' => null, 'needsReason' => true])
                ->where('chargeTypes.1', ['value' => 'disconnection_fee', 'label' => 'رسوم قطع الخدمة', 'usualAmount' => 50, 'needsReason' => false])
                ->where('chargeTypes.2', ['value' => 'subscription_fee', 'label' => 'رسوم اشتراك', 'usualAmount' => null, 'needsReason' => false]));
    }

    public function test_a_clearing_takes_the_value_of_the_subscribers_service_off_what_they_owe(): void
    {
        $this->subscriberOwes('100.00');

        $this->postAs($this->branchAdmin, route('subscribers.clearings.store', $this->subscriber), ['amount' => '40', 'notes' => 'صيانة المولد'])
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'clearing-recorded');

        $clearing = $this->latestTransaction();
        $this->assertSame(['clearing', '-40.00', 'صيانة المولد'], [$clearing->type, $clearing->amount, $clearing->notes]);
        $this->assertSame(
            ['action' => 'clearing-recorded', 'subject' => 'Ahmad — مقاصة 40 شيكل'],
            $this->branchAdmin->notifications()->sole()->data,
        );

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.1.typeLabel', 'مقاصة')
                ->where('entries.1.description', 'مقاصة مقابل خدمة للشركة')
                ->where('entries.1.details', 'صيانة المولد')
                ->where('entries.1.isCredit', true)
                ->where('entries.1.recorded.kind', 'clearing')
                ->where('summary.balance', '60.00')
                ->where('summary.charged', '100.00')
                ->where('summary.paid', '0.00')
                ->where('summary.cleared', '40.00')
                ->where('summary.clearingsCount', 1));
    }

    public function test_a_clearing_worth_more_than_the_subscriber_owes_leaves_them_in_credit(): void
    {
        $this->subscriberOwes('30.00');

        $this->postAs($this->branchAdmin, route('subscribers.clearings.store', $this->subscriber), ['amount' => '50', 'notes' => 'تأجير السطح'])
            ->assertSessionHasNoErrors();

        $this->assertSame(-20.0, $this->subscriber->balance());
    }

    public function test_a_clearing_must_name_the_service_and_its_value(): void
    {
        $this->postAs($this->branchAdmin, route('subscribers.clearings.store', $this->subscriber), ['amount' => '0', 'notes' => ''])
            ->assertSessionHasErrors(['amount', 'notes' => 'اكتب الخدمة التي قدّمها المشترك؛ تظهر في كشف حسابه.']);

        $this->assertDatabaseCount('subscriber_transactions', 0);
    }

    public function test_a_shekel_discount_lowers_the_balance_and_is_listed_as_a_discount(): void
    {
        $this->subscriberOwes('100.00');

        $this->discount('shekel', '30')
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'discount-recorded');

        $this->assertSame('-30.00', $this->latestTransaction()->amount);
        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.1.typeLabel', 'خصم')
                ->where('entries.1.description', 'خصم لمرة واحدة · مبلغ ثابت')
                ->where('entries.1.isCredit', true)
                ->where('summary.balance', '70.00')
                ->where('summary.charged', '100.00')
                ->where('summary.discounted', '30.00'));
    }

    /**
     * Percentages and free kilowatts belong to the weekly readings discount.
     */
    #[TestWith(['percentage', '10'])]
    #[TestWith(['kilowatt', '25'])]
    public function test_a_one_off_discount_is_given_in_shekels_only(string $method, string $value): void
    {
        $this->subscriberOwes('100.00');

        $this->discount($method, $value)
            ->assertSessionHasErrors(['method' => 'الخصم لمرة واحدة يكون بالشيكل فقط.']);

        $this->assertDatabaseCount('subscriber_transactions', 1);
    }

    public function test_a_discount_cannot_be_more_than_the_subscriber_owes(): void
    {
        $this->discount('shekel', '5')
            ->assertSessionHasErrors(['value' => 'لا يوجد رصيد مستحق على المشترك ليُخصم منه.']);

        $this->subscriberOwes('20.00');

        $this->discount('shekel', '30')
            ->assertSessionHasErrors(['value' => 'لا يمكن أن يزيد الخصم (30 شيكل) عن الرصيد المستحق (20 شيكل).']);
        $this->assertDatabaseCount('subscriber_transactions', 1);
    }

    /**
     * @param  array<string, string>  $input
     */
    #[TestWith(['charges', ['type' => 'bonus', 'amount' => '10'], 'type'])]
    #[TestWith(['charges', ['type' => 'settlement', 'amount' => '10'], 'type'])]
    #[TestWith(['charges', ['type' => 'disconnection_fee', 'amount' => '0'], 'amount'])]
    #[TestWith(['discounts', ['method' => 'shekel', 'value' => '0'], 'value'])]
    #[TestWith(['discounts', ['method' => 'coupon', 'value' => '10'], 'method'])]
    public function test_an_invalid_charge_or_discount_is_rejected(string $kind, array $input, string $field): void
    {
        $this->subscriberOwes('100.00');

        $this->postAs($this->branchAdmin, route("subscribers.{$kind}.store", $this->subscriber), $input)
            ->assertSessionHasErrors($field);

        $this->assertDatabaseCount('subscriber_transactions', 1);
    }

    public function test_charges_discounts_and_clearings_take_their_own_permission_within_the_branch(): void
    {
        $this->subscriberOwes('100.00');
        $dataEntry = User::factory()->dataEntry()->create(['branch_id' => $this->branch->id]);
        $accountant = User::factory()->accountant()->create(['branch_id' => $this->branch->id]);
        $clearing = ['amount' => '10', 'notes' => 'صيانة'];

        $this->postAs($dataEntry, route('subscribers.charges.store', $this->subscriber), ['type' => 'penalty', 'amount' => '10', 'notes' => 'x'])->assertForbidden();
        $this->postAs($dataEntry, route('subscribers.clearings.store', $this->subscriber), $clearing)->assertForbidden();
        $this->postAs(User::factory()->branchAdmin()->create(), route('subscribers.discounts.store', $this->subscriber), ['method' => 'shekel', 'value' => '10'])
            ->assertForbidden();
        $this->postAs(User::factory()->branchAdmin()->create(), route('subscribers.clearings.store', $this->subscriber), $clearing)->assertForbidden();
        $this->postAs($accountant, route('subscribers.charges.store', $this->subscriber), ['type' => 'penalty', 'amount' => '10', 'notes' => 'x'])->assertSessionHasNoErrors();
        $this->postAs($accountant, route('subscribers.clearings.store', $this->subscriber), $clearing)->assertSessionHasNoErrors();

        $this->actingAs($dataEntry)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page->where('canAdjustBalance', false));
        $this->assertDatabaseCount('subscriber_transactions', 3);
    }

    /**
     * POST as the given user, coming from the subscriber's statement.
     *
     * @param  array<string, string>  $data
     */
    private function postAs(User $user, string $uri, array $data): TestResponse
    {
        return $this->actingAs($user)->from(route('subscribers.statement', $this->subscriber))->post($uri, $data);
    }

    private function discount(string $method, string $value): TestResponse
    {
        return $this->postAs($this->branchAdmin, route('subscribers.discounts.store', $this->subscriber), ['method' => $method, 'value' => $value]);
    }

    private function subscriberOwes(string $amount): void
    {
        SubscriberTransaction::factory()->for($this->subscriber)->create(['amount' => $amount]);
    }

    private function latestTransaction(): SubscriberTransaction
    {
        return SubscriberTransaction::latest('id')->first();
    }
}
