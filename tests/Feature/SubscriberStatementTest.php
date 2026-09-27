<?php

namespace Tests\Feature;

use App\Enums\ChargeType;
use App\Models\Branch;
use App\Models\MeterReading;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class SubscriberStatementTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;

    private User $branchAdmin;

    private Subscriber $subscriber;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo('2026-08-20 09:15:00');
        $this->branch = Branch::factory()->create();
        $this->branchAdmin = User::factory()->branchAdmin()->create(['branch_id' => $this->branch->id, 'name' => 'Mohammed']);
        $this->subscriber = Subscriber::factory()->create(['branch_id' => $this->branch->id, 'full_name' => 'Ahmad']);
    }

    public function test_the_statement_lists_charges_and_payments_oldest_first_with_the_balance_after_each(): void
    {
        SubscriberTransaction::factory()->for($this->subscriber)->create(['amount' => '50.00', 'recorded_by' => $this->branchAdmin->id]);

        $this->travelTo('2026-08-28 10:02:00');
        MeterReading::factory()->create([
            'subscriber_id' => $this->subscriber->id,
            'week_start' => '2026-08-21',
            'week_end' => '2026-08-27',
            'previous_reading' => 1000,
            'current_reading' => 1179,
            'consumption' => 179,
            'amount_due' => '53.70',
            'notes' => 'قراءة من الطبلون',
        ])->approve($this->branchAdmin);

        $this->travelTo('2026-08-30 12:40:00');
        $this->recordPayment(['amount' => '20', 'currency' => 'USD', 'exchange_rate' => '3.7', 'cash_box' => '3', 'manual_voucher_number' => '4471'])
            ->assertSessionHasNoErrors();

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Subscribers/Statement')
                ->where('subscriber.fullName', 'Ahmad')
                ->where('entries', function ($entries): bool {
                    $this->assertSame(
                        ['رسوم اشتراك جديد', 'قراءة أسبوعية من 2026-08-21 إلى 2026-08-27 · 179 كيلو', 'دفعة نقدية'],
                        collect($entries)->pluck('description')->all(),
                    );
                    $this->assertSame(['50.00', '103.70', '29.70'], collect($entries)->pluck('balance')->all());
                    $this->assertSame(['رسوم اشتراك', 'قراءة أسبوعية', 'دفعة'], collect($entries)->pluck('typeLabel')->all());
                    $this->assertSame('قراءة من الطبلون', $entries[1]['details']);
                    $this->assertSame([
                        'date' => '2026-08-30 12:40',
                        'voucherNumber' => '000001',
                        'manualVoucherNumber' => '4471',
                        'isCredit' => true,
                        'amount' => '20.00',
                        'currencyLabel' => 'دولار',
                        'exchangeRate' => '3.7',
                        'paymentMethodLabel' => 'نقد',
                        'cashBox' => '3',
                        'recordedByName' => 'Mohammed',
                    ], collect($entries[2])->only([
                        'date', 'voucherNumber', 'manualVoucherNumber', 'isCredit', 'amount', 'currencyLabel', 'exchangeRate', 'paymentMethodLabel', 'cashBox', 'recordedByName',
                    ])->all());

                    return true;
                })
                ->where('summary', ['balance' => '29.70', 'charged' => '103.70', 'paid' => '74.00', 'paymentsCount' => 1, 'discounted' => '0.00', 'discountsCount' => 0])
                ->where('canRecordPayment', true));
    }

    public function test_a_payment_lowers_the_balance_at_its_exchange_rate_and_gets_the_next_voucher_number(): void
    {
        SubscriberTransaction::factory()->for($this->subscriber)->create(['amount' => '100.00']);

        $this->recordPayment(['amount' => '20', 'currency' => 'USD', 'exchange_rate' => '3.7'])
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'payment-recorded')
            ->assertRedirect(route('subscribers.statement', $this->subscriber));
        $this->recordPayment(['amount' => '4', 'currency' => 'JOD', 'exchange_rate' => '5.215']);

        $this->assertSame(['-74.00', '-20.86'], SubscriberTransaction::where('type', 'payment')->orderBy('id')->pluck('amount')->all());
        $this->assertSame([1, 2], SubscriberTransaction::where('type', 'payment')->orderBy('id')->pluck('voucher_number')->all());
        $this->assertSame(
            ['action' => 'payment-recorded', 'subject' => 'Ahmad — 74 شيكل'],
            $this->branchAdmin->notifications()->oldest()->first()->data,
        );

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.index'))
            ->assertInertia(fn ($page) => $page->where('subscribers.data.0.outstandingBalance', fn ($balance): bool => round((float) $balance, 2) === 5.14));
    }

    public function test_a_shekel_payment_is_always_taken_at_a_rate_of_one(): void
    {
        $this->recordPayment(['amount' => '30', 'currency' => 'ILS', 'exchange_rate' => '5'])->assertSessionHasNoErrors();

        $payment = SubscriberTransaction::sole();
        $this->assertSame('-30.00', $payment->amount);
        $this->assertSame('1.0000', $payment->exchange_rate);
    }

    public function test_a_bank_transfer_needs_one_of_the_transfer_banks_and_its_number_and_keeps_no_cash_box(): void
    {
        $this->recordPayment(['payment_method' => 'bank_transfer', 'bank_name' => '', 'reference_number' => ''])
            ->assertSessionHasErrors(['bank_name' => 'اختر البنك أو المحفظة التي حُوّل إليها المبلغ.', 'reference_number']);
        $this->recordPayment(['payment_method' => 'bank_transfer', 'bank_name' => 'بنك القاهرة', 'reference_number' => 'TRX-1'])
            ->assertSessionHasErrors(['bank_name' => 'اختر أحد البنوك أو المحافظ المتاحة.']);
        $this->assertDatabaseCount('subscriber_transactions', 0);

        $this->recordPayment(['payment_method' => 'bank_transfer', 'bank_name' => 'جوال باي', 'reference_number' => 'TRX-88214', 'cash_box' => '3'])
            ->assertSessionHasNoErrors();

        $transfer = SubscriberTransaction::sole();
        $this->assertSame(['جوال باي', 'TRX-88214', null], [$transfer->bank_name, $transfer->reference_number, $transfer->cash_box]);
    }

    /**
     * @param  array<string, string>  $payment
     */
    #[TestWith([['amount' => '0'], 'amount'])]
    #[TestWith([['amount' => '10.555'], 'amount'])]
    #[TestWith([['currency' => 'EUR'], 'currency'])]
    #[TestWith([['currency' => 'USD', 'exchange_rate' => ''], 'exchange_rate'])]
    #[TestWith([['payment_method' => 'gold'], 'payment_method'])]
    #[TestWith([['payment_method' => 'cheque', 'bank_name' => 'بنك فلسطين', 'reference_number' => '77'], 'payment_method'])]
    #[TestWith([['payment_method' => 'e_wallet'], 'payment_method'])]
    public function test_an_invalid_payment_is_rejected(array $payment, string $field): void
    {
        $this->recordPayment($payment)->assertSessionHasErrors($field);

        $this->assertDatabaseCount('subscriber_transactions', 0);
    }

    public function test_recording_payments_takes_the_record_collections_permission_within_the_branch(): void
    {
        $dataEntry = User::factory()->dataEntry()->create(['branch_id' => $this->branch->id]);
        $otherBranchAdmin = User::factory()->branchAdmin()->create();

        $this->recordPayment([], $dataEntry)->assertForbidden();
        $this->recordPayment([], $otherBranchAdmin)->assertForbidden();

        $this->actingAs($dataEntry)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('canRecordPayment', false));
        $this->assertDatabaseCount('subscriber_transactions', 0);
    }

    public function test_a_payment_goes_to_the_charges_picked_for_it_and_its_line_says_what_it_paid_for(): void
    {
        $fee = $this->charge('subscription_fee', '50.00');
        $penalty = $this->charge('penalty', '20.00');

        $this->recordPayment(['amount' => '20', 'charge_ids' => [$penalty->id]])->assertSessionHasNoErrors();

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.2.paidFor', 'عن: غرامة مالية 2026-08-20 (20)')
                ->where('unpaidCharges', [['id' => $fee->id, 'label' => 'رسوم اشتراك', 'remaining' => '50.00']]));
    }

    public function test_a_payment_without_picks_pays_the_oldest_charges_and_anything_over_stays_as_credit(): void
    {
        $this->charge('subscription_fee', '50.00');
        $this->charge('penalty', '20.00');

        $this->recordPayment(['amount' => '100'])->assertSessionHasNoErrors();

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.2.paidFor', 'عن: رسوم اشتراك (50)، غرامة مالية 2026-08-20 (20) · والباقي 30 شيكل رصيد له')
                ->where('summary.balance', '-30.00')
                ->where('unpaidCharges', []));
    }

    public function test_credit_left_from_a_payment_goes_towards_the_next_charge(): void
    {
        $this->charge('subscription_fee', '50.00');
        $this->recordPayment(['amount' => '80']);

        SubscriberTransaction::recordCharge($this->subscriber, $this->branchAdmin, ChargeType::Settlement, '40', null);

        $payment = SubscriberTransaction::where('type', 'payment')->sole();
        $this->assertSame('عن: رسوم اشتراك (50)، تسوية 2026-08-20 (30)', $payment->paidForText());
        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page->where('unpaidCharges.0.remaining', '10.00'));
    }

    public function test_reopening_an_approved_reading_frees_what_paid_for_it_until_it_is_approved_again(): void
    {
        $reading = MeterReading::factory()->create([
            'subscriber_id' => $this->subscriber->id,
            'unit_price' => '0.50',
            'minimum_payment' => '0.00',
            'amount_due' => '53.70',
        ]);
        $reading->approve($this->branchAdmin);
        $this->recordPayment(['amount' => '53.70']);
        $payment = SubscriberTransaction::where('type', 'payment')->sole();

        $reading->correct($reading->current_reading + 10, null);

        $this->assertSame('رصيد له 53.70 شيكل', $payment->fresh()->paidForText());

        $reading->fresh()->approve($this->branchAdmin);

        $this->assertStringStartsWith('عن: قراءة الأسبوع المنتهي في ', $payment->fresh()->paidForText());
    }

    public function test_a_payment_can_only_be_picked_for_the_subscribers_own_charges(): void
    {
        $othersCharge = SubscriberTransaction::factory()->create();

        $this->recordPayment(['charge_ids' => [$othersCharge->id]])
            ->assertSessionHasErrors(['charge_ids.0' => 'أحد البنود المختارة لا يخص هذا المشترك.']);

        $this->assertDatabaseCount('subscriber_transactions', 1);
    }

    public function test_payments_recorded_before_are_set_against_the_oldest_charges(): void
    {
        $fee = $this->charge('subscription_fee', '50.00');
        $penalty = $this->charge('penalty', '20.00');
        $payment = $this->charge('payment', '-60.00');

        $this->subscriber->applyCredits();

        $this->assertSame(
            [$fee->id => 50.0, $penalty->id => 10.0],
            $payment->coveredCharges()->orderBy('charge_id')->get()->mapWithKeys(fn ($charge) => [$charge->id => (float) $charge->pivot->amount])->all(),
        );
    }

    public function test_the_statement_is_only_shown_within_the_actors_branch(): void
    {
        $this->actingAs(User::factory()->branchAdmin()->create())
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertForbidden();

        $this->actingAs(User::factory()->collector()->create(['branch_id' => $this->branch->id]))
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertForbidden();
    }

    private function charge(string $type, string $amount): SubscriberTransaction
    {
        return SubscriberTransaction::factory()->for($this->subscriber)->create([
            'type' => $type,
            'amount' => $amount,
            'source_key' => $type.':'.Str::ulid(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function recordPayment(array $overrides = [], ?User $actor = null): TestResponse
    {
        return $this->actingAs($actor ?? $this->branchAdmin)
            ->from(route('subscribers.statement', $this->subscriber))
            ->post(route('subscribers.payments.store', $this->subscriber), [
                'amount' => '25',
                'currency' => 'ILS',
                'payment_method' => 'cash',
                ...$overrides,
            ]);
    }
}
