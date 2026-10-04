<?php

namespace Tests\Feature;

use App\Enums\ChargeType;
use App\Enums\CorrectionReason;
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
                    $this->assertSame(['رسوم اشتراك', 'قراءة أسبوعية', 'دفعة'], collect($entries)->pluck('typeLabel')->all());
                    $this->assertSame('قراءة من الطبلون', $entries[1]['details']);
                    $this->assertSame([
                        // Recorded at 12:40 UTC: the statement shows the business's clock (Gaza, UTC+3).
                        'date' => '2026-08-30 15:40',
                        'voucherNumber' => '4471',
                        'systemVoucherNumber' => '000001',
                        'manualVoucherNumber' => '4471',
                        'isCredit' => true,
                        'amount' => '20.00',
                        'currencyLabel' => 'دولار',
                        'exchangeRate' => '3.7',
                        'paymentMethodLabel' => 'نقد',
                        'cashBox' => '3',
                        'recordedByName' => 'Mohammed',
                    ], collect($entries[2])->only([
                        'date', 'voucherNumber', 'systemVoucherNumber', 'manualVoucherNumber', 'isCredit', 'amount', 'currencyLabel', 'exchangeRate', 'paymentMethodLabel', 'cashBox', 'recordedByName',
                    ])->all());

                    return true;
                })
                ->where('summary', [
                    'balance' => '29.70',
                    'charged' => '103.70',
                    'paid' => '74.00',
                    'paymentsCount' => 1,
                    'discounted' => '0.00',
                    'discountsCount' => 0,
                    'cleared' => '0.00',
                    'clearingsCount' => 0,
                ])
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

    public function test_a_bank_transfer_needs_one_of_the_transfer_banks_its_number_and_sender_and_keeps_no_cash_box_or_paper_voucher(): void
    {
        $this->recordPayment(['payment_method' => 'bank_transfer', 'bank_name' => '', 'reference_number' => '', 'sender_name' => ''])
            ->assertSessionHasErrors([
                'bank_name' => 'اختر البنك أو المحفظة التي حُوّل إليها المبلغ.',
                'reference_number',
                'sender_name' => 'أدخل اسم صاحب الحساب الذي حُوّل منه المبلغ.',
            ]);
        $this->recordPayment(['payment_method' => 'bank_transfer', 'bank_name' => 'بنك القاهرة', 'reference_number' => 'TRX-1', 'sender_name' => 'Ahmad'])
            ->assertSessionHasErrors(['bank_name' => 'اختر أحد البنوك أو المحافظ المتاحة.']);
        $this->assertDatabaseCount('subscriber_transactions', 0);

        $this->recordPayment([
            'payment_method' => 'bank_transfer',
            'bank_name' => 'جوال باي',
            'reference_number' => 'TRX-88214',
            'sender_name' => 'محمود سالم',
            'cash_box' => '3',
            'manual_voucher_number' => '4471',
        ])->assertSessionHasNoErrors();

        $transfer = SubscriberTransaction::sole();
        $this->assertSame(
            ['جوال باي', 'TRX-88214', null, null],
            [$transfer->bank_name, $transfer->reference_number, $transfer->cash_box, $transfer->manual_voucher_number],
        );
        $this->assertSame('دفعة بتحويل بنكي من محمود سالم', $transfer->description());
    }

    public function test_transfer_references_are_unique_company_wide_after_normalization(): void
    {
        $otherSubscriber = Subscriber::factory()->create(['full_name' => 'Mona']);
        $otherCollector = User::factory()->branchAdmin()->create(['branch_id' => $otherSubscriber->branch_id]);
        $existing = SubscriberTransaction::recordPayment($otherSubscriber, $otherCollector, [
            'amount' => '25',
            'currency' => 'ILS',
            'payment_method' => 'bank_transfer',
            'bank_name' => 'بنك فلسطين',
            'sender_name' => 'Mona',
            'reference_number' => ' tr  - 42 ',
        ]);

        $this->recordPayment([
            'payment_method' => 'bank_transfer',
            'bank_name' => 'بنك فلسطين',
            'sender_name' => 'Ahmad',
            'reference_number' => 'TR-42',
        ])->assertSessionHasErrors([
            'reference_number' => 'هذا الرقم المرجعي مسجَّل مسبقًا على دفعة أخرى — السند '.$existing->printedVoucherNumber().' للمشترك Mona.',
        ]);

        $this->assertSame('TR-42', $existing->active_reference);
        $this->assertDatabaseCount('subscriber_transactions', 1);
    }

    public function test_live_reference_check_reports_conflicts_and_warns_about_same_day_duplicates(): void
    {
        $this->recordPayment([
            'payment_method' => 'bank_transfer',
            'bank_name' => 'بنك فلسطين',
            'sender_name' => 'Ahmad',
            'reference_number' => 'TR-LIVE-1',
        ])->assertSessionHasNoErrors();
        $payment = SubscriberTransaction::sole();

        $this->actingAs($this->branchAdmin)
            ->getJson(route('subscribers.payments.reference-status', [$this->subscriber, 'reference_number' => ' tr-live-1 ']))
            ->assertOk()
            ->assertJsonPath('available', false)
            ->assertJsonPath('conflict.id', $payment->id)
            ->assertJsonPath('conflict.voucherNumber', $payment->printedVoucherNumber());

        $this->getJson(route('subscribers.payments.reference-status', [
            $this->subscriber,
            'reference_number' => 'TR-LIVE-2',
            'amount' => '25',
            'currency' => 'ILS',
            'sender_name' => 'Ahmad',
        ]))
            ->assertOk()
            ->assertJsonPath('available', true)
            ->assertJsonPath('warning.id', $payment->id);
    }

    public function test_cancelling_a_transfer_releases_its_reference_for_reuse(): void
    {
        $this->recordPayment([
            'payment_method' => 'bank_transfer',
            'bank_name' => 'بنك فلسطين',
            'sender_name' => 'Ahmad',
            'reference_number' => 'REUSE-7',
        ])->assertSessionHasNoErrors();
        $payment = SubscriberTransaction::sole();

        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.transactions.destroy', [$this->subscriber, $payment]), [
                'correction_reason' => 'duplicate',
                'correction_notes' => 'أُلغي لإعادة التسجيل',
            ])->assertSessionHasNoErrors();

        $this->recordPayment([
            'payment_method' => 'bank_transfer',
            'bank_name' => 'بنك فلسطين',
            'sender_name' => 'Ahmad',
            'reference_number' => ' reuse - 7 ',
        ])->assertSessionHasNoErrors();

        $this->assertNull($payment->fresh()->active_reference);
        $this->assertSame('REUSE-7', SubscriberTransaction::whereNull('cancelled_at')->where('type', 'payment')->sole()->active_reference);
    }

    #[TestWith(['بنك فلسطين'])]
    #[TestWith(['محفظة بالباي'])]
    #[TestWith(['جوال باي'])]
    #[TestWith(['البنك الإسلامي الفلسطيني'])]
    #[TestWith(['البنك الوطني الإسلامي'])]
    public function test_each_offered_bank_can_be_a_transfer_source_and_destination(string $bank): void
    {
        $this->recordPayment([
            'payment_method' => 'bank_transfer',
            'bank_name' => $bank,
            'sender_bank_name' => $bank,
            'sender_name' => 'Ahmad',
            'reference_number' => 'TR-1',
        ])->assertSessionHasNoErrors();

        $transfer = SubscriberTransaction::sole();
        $this->assertSame($bank, $transfer->bank_name);
        $this->assertSame($bank, $transfer->sender_bank_name);

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('transferBanks', config('powercollect.transfer_banks'))
                ->where('entries.0.bankName', $bank)
                ->where('entries.0.senderBankName', $bank)
                ->where('entries.0.recorded.sender_bank_name', $bank));
    }

    public function test_a_transfer_rejects_an_unlisted_source_bank(): void
    {
        $this->recordPayment([
            'payment_method' => 'bank_transfer',
            'bank_name' => 'بنك فلسطين',
            'sender_bank_name' => 'بنك القاهرة',
            'sender_name' => 'Ahmad',
            'reference_number' => 'TR-1',
        ])->assertSessionHasErrors('sender_bank_name');

        $this->assertDatabaseCount('subscriber_transactions', 0);
    }

    public function test_every_time_on_the_statement_follows_the_business_clock_even_across_midnight(): void
    {
        // 22:30 UTC on 30 August is 01:30 on 31 August in Gaza.
        $this->travelTo('2026-08-30 22:30:00');
        $payment = SubscriberTransaction::recordPayment($this->subscriber, $this->branchAdmin, ['amount' => '25', 'currency' => 'ILS', 'payment_method' => 'cash']);
        SubscriberTransaction::recordCharge($this->subscriber, $this->branchAdmin, ChargeType::Penalty, '10', null);
        $this->travelTo('2026-08-30 23:10:00');
        $payment->amend($this->branchAdmin, ['notes' => 'تصحيح'], 'توضيح');
        $payment->cancel($this->branchAdmin, CorrectionReason::Duplicate, null);

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.0.date', '2026-08-31 01:30')
                ->where('entries.0.amendments.0.at', '2026-08-31 02:10')
                ->where('entries.0.cancellation.at', '2026-08-31 02:10'));
    }

    public function test_a_recorded_payment_hands_its_form_the_voucher_number_and_the_balance_it_left(): void
    {
        SubscriberTransaction::factory()->for($this->subscriber)->create(['amount' => '50.00', 'recorded_by' => $this->branchAdmin->id]);

        $this->followingRedirects()
            ->recordPayment(['amount' => '20', 'currency' => 'USD', 'exchange_rate' => '3.7'])
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Subscribers/Statement')
                ->hasFlash('recordedPayment.voucherNumber', '000001')
                ->hasFlash('recordedPayment.balance', '-24.00'));
    }

    public function test_a_cash_payment_keeps_no_sender(): void
    {
        $this->recordPayment(['payment_method' => 'cash', 'sender_name' => 'محمود سالم', 'bank_name' => 'بنك فلسطين', 'sender_bank_name' => 'جوال باي'])->assertSessionHasNoErrors();

        $payment = SubscriberTransaction::sole();
        $this->assertNull($payment->sender_name);
        $this->assertNull($payment->bank_name);
        $this->assertNull($payment->sender_bank_name);
        $this->assertSame('دفعة نقدية', $payment->description());
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

    public function test_the_subscribers_list_opens_the_statement_named_in_its_address(): void
    {
        SubscriberTransaction::factory()->for($this->subscriber)->create(['amount' => '50.00', 'recorded_by' => $this->branchAdmin->id]);

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.index', ['statement' => $this->subscriber->id]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Subscribers/Index')
                ->where('statement.subscriber.fullName', 'Ahmad')
                ->where('statement.entries.0.description', 'رسوم اشتراك جديد')
                ->where('statement.summary.balance', '50.00')
                ->where('statement.canRecordPayment', true));
    }

    /**
     * @param  array<string, mixed>  $query
     */
    #[TestWith([[]])]
    #[TestWith([['statement' => 'abc']])]
    #[TestWith([['statement' => ['1']]])]
    public function test_the_subscribers_list_opens_no_statement_without_a_subscriber_id(array $query): void
    {
        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.index', $query))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('statement', null));
    }

    public function test_the_subscribers_list_does_not_open_another_branchs_statement(): void
    {
        $this->actingAs(User::factory()->branchAdmin()->create())
            ->get(route('subscribers.index', ['statement' => $this->subscriber->id]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('statement', null));
    }

    public function test_a_payment_saved_over_the_list_returns_to_the_list_with_the_statement_still_open(): void
    {
        $listWithStatement = route('subscribers.index', ['page' => 2, 'statement' => $this->subscriber->id]);

        $this->actingAs($this->branchAdmin)
            ->from($listWithStatement)
            ->post(route('subscribers.payments.store', $this->subscriber), ['amount' => '25', 'currency' => 'ILS', 'payment_method' => 'cash'])
            ->assertSessionHasNoErrors()
            ->assertRedirect($listWithStatement);
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
