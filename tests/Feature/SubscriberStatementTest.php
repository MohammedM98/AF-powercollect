<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\MeterReading;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
                    $this->assertSame('قراءة من الطبلون', $entries[1]['notes']);
                    $this->assertSame([
                        'date' => '2026-08-30 12:40',
                        'voucherNumber' => '000001',
                        'manualVoucherNumber' => '4471',
                        'isPayment' => true,
                        'amount' => '20.00',
                        'currencyLabel' => 'دولار',
                        'exchangeRate' => '3.7',
                        'paymentMethodLabel' => 'نقد',
                        'cashBox' => '3',
                        'recordedByName' => 'Mohammed',
                    ], collect($entries[2])->only([
                        'date', 'voucherNumber', 'manualVoucherNumber', 'isPayment', 'amount', 'currencyLabel', 'exchangeRate', 'paymentMethodLabel', 'cashBox', 'recordedByName',
                    ])->all());

                    return true;
                })
                ->where('summary', ['balance' => '29.70', 'charged' => '103.70', 'paid' => '74.00', 'paymentsCount' => 1])
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
            ['action' => 'payment-recorded', 'subject' => 'Ahmad — 74.00 شيكل'],
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

    public function test_a_bank_transfer_or_cheque_needs_its_bank_and_number_and_keeps_no_cash_box(): void
    {
        $this->recordPayment(['payment_method' => 'cheque', 'bank_name' => '', 'reference_number' => ''])
            ->assertSessionHasErrors(['bank_name', 'reference_number']);

        $this->recordPayment(['payment_method' => 'bank_transfer', 'bank_name' => 'بنك فلسطين', 'reference_number' => 'TRX-88214', 'cash_box' => '3'])
            ->assertSessionHasNoErrors();
        $this->recordPayment(['payment_method' => 'e_wallet', 'bank_name' => 'بنك فلسطين', 'reference_number' => ''])
            ->assertSessionHasNoErrors();

        [$transfer, $wallet] = SubscriberTransaction::orderBy('id')->get();
        $this->assertSame(['بنك فلسطين', 'TRX-88214', null], [$transfer->bank_name, $transfer->reference_number, $transfer->cash_box]);
        $this->assertNull($wallet->bank_name);
    }

    /**
     * @param  array<string, string>  $payment
     */
    #[TestWith([['amount' => '0'], 'amount'])]
    #[TestWith([['amount' => '10.555'], 'amount'])]
    #[TestWith([['currency' => 'EUR'], 'currency'])]
    #[TestWith([['currency' => 'USD', 'exchange_rate' => ''], 'exchange_rate'])]
    #[TestWith([['payment_method' => 'gold'], 'payment_method'])]
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

    public function test_the_statement_is_only_shown_within_the_actors_branch(): void
    {
        $this->actingAs(User::factory()->branchAdmin()->create())
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertForbidden();

        $this->actingAs(User::factory()->collector()->create(['branch_id' => $this->branch->id]))
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertForbidden();
    }

    /**
     * @param  array<string, string>  $overrides
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
