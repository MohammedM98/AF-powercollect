<?php

namespace Tests\Feature;

use App\Enums\ChargeType;
use App\Enums\DiscountMethod;
use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Permission;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class SubscriberTransactionCorrectionTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;

    private User $branchAdmin;

    private Subscriber $subscriber;

    protected function setUp(): void
    {
        parent::setUp();

        $this->branch = Branch::factory()->create();
        $this->branchAdmin = User::factory()->branchAdmin()->create(['branch_id' => $this->branch->id, 'name' => 'Sami']);
        $this->subscriber = Subscriber::factory()->create(['branch_id' => $this->branch->id, 'full_name' => 'Ahmad']);
        SubscriberTransaction::factory()->for($this->subscriber)->create(['amount' => '200.00']);
    }

    public function test_correcting_a_payment_cancels_it_and_records_the_right_one_under_it(): void
    {
        $payment = $this->recordPayment(['amount' => '80', 'payment_method' => 'cash']);

        $this->correct($payment, [
            ...$this->transfer('100'),
            'correction_reason' => 'wrong_amount',
            'correction_notes' => 'المشترك دفع 100 وليس 80',
        ])
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'transaction-corrected')
            ->assertRedirect(route('subscribers.statement', $this->subscriber));

        $payment->refresh();
        $this->assertTrue($payment->isCancelled());
        $this->assertSame(['wrong_amount', 'المشترك دفع 100 وليس 80', $this->branchAdmin->id], [$payment->cancellation_reason->value, $payment->cancellation_notes, $payment->cancelled_by]);

        $reversal = SubscriberTransaction::where('reverses_id', $payment->id)->sole();
        $this->assertSame(['reversal', '80.00', 'cash'], [$reversal->type, $reversal->amount, $reversal->payment_method->value]);

        $replacement = $payment->correction;
        $this->assertSame(['payment', '-100.00', 'bank_transfer', 'بنك فلسطين'], [$replacement->type, $replacement->amount, $replacement->payment_method->value, $replacement->bank_name]);
        $this->assertSame($payment->voucher_number + 1, $replacement->voucher_number);
        $this->assertSame(100.0, $this->subscriber->balance());
        $this->assertSame(
            ['action' => 'transaction-corrected', 'subject' => 'Ahmad — دفعة 100 شيكل'],
            $this->branchAdmin->notifications()->latest('id')->first()->data,
        );

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.1.id', $payment->id)
                ->where('entries.1.cancellation.wasCorrected', true)
                ->where('entries.1.cancellation.reasonLabel', 'مبلغ خاطئ')
                ->where('entries.1.cancellation.byName', 'Sami')
                ->where('entries.1.canCorrect', false)
                ->where('entries.2.id', $reversal->id)
                ->where('entries.2.isFollowUp', true)
                ->where('entries.2.isCredit', false)
                ->where('entries.2.description', 'إلغاء: دفعة نقدية · سند '.$payment->printedVoucherNumber())
                ->where('entries.2.balance', '200.00')
                ->where('entries.3.id', $replacement->id)
                ->where('entries.3.isCorrection', true)
                ->where('entries.3.canCorrect', true)
                ->where('entries.3.balance', '100.00')
                ->where('summary.paid', '100.00')
                ->where('summary.paymentsCount', 1));
    }

    public function test_a_corrected_cash_payment_is_grouped_with_its_reversal_which_shows_its_voucher_and_cash_box(): void
    {
        $payment = $this->recordPayment(['amount' => '80', 'payment_method' => 'cash', 'manual_voucher_number' => '00412', 'cash_box' => '4554']);

        $this->correct($payment, [
            'amount' => '100',
            'currency' => 'ILS',
            'payment_method' => 'cash',
            'manual_voucher_number' => '00413',
            'cash_box' => '4554',
            'correction_reason' => 'wrong_amount',
            'correction_notes' => 'x',
        ])->assertSessionHasNoErrors();

        $fee = $this->subscriber->transactions()->oldest('id')->first();

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.0.groupId', $fee->id)
                ->where('entries.1.groupId', $payment->id)
                ->where('entries.2.groupId', $payment->id)
                ->where('entries.2.isReversal', true)
                ->where('entries.2.voucherNumber', $payment->printedVoucherNumber())
                ->where('entries.2.manualVoucherNumber', '00412')
                ->where('entries.2.cashBox', '4554')
                ->where('entries.3.groupId', $payment->correction->id)
                ->where('entries.3.corrects.id', $payment->id)
                ->where('entries.3.manualVoucherNumber', '00413')
                ->where('entries.3.recorded.manual_voucher_number', '00413')
                ->where('entries.3.recorded.cash_box', '4554'));
    }

    public function test_the_reversal_stays_under_its_line_and_the_correction_comes_last_after_the_lines_between(): void
    {
        $payment = $this->recordPayment(['amount' => '80', 'payment_method' => 'cash']);
        $charge = SubscriberTransaction::recordCharge($this->subscriber, $this->branchAdmin, ChargeType::Penalty, '20', null);

        $this->correct($payment, [...$this->transfer('80'), 'correction_reason' => 'wrong_payment_method', 'correction_notes' => 'حوّلها عبر البنك'])
            ->assertSessionHasNoErrors();

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.1.id', $payment->id)
                ->where('entries.2.type', 'reversal')
                ->where('entries.2.isFollowUp', true)
                ->where('entries.3.id', $charge->id)
                ->where('entries.4.isCorrection', true)
                ->where('entries.4.isFollowUp', false)
                ->where('entries.4.corrects.id', $payment->id)
                ->where('entries.4.paymentMethod', 'bank_transfer')
                ->where('entries.4.balance', '140.00')
                ->where('summary.balance', '140.00'));
    }

    public function test_correcting_a_transfer_preserves_the_original_bank_pair_and_prefills_the_replacement_pair(): void
    {
        $payment = $this->recordPayment([
            ...$this->transfer('25'),
            'sender_bank_name' => 'جوال باي',
        ]);

        $this->correct($payment, [
            ...$this->transfer('30'),
            'bank_name' => 'البنك الإسلامي الفلسطيني',
            'sender_bank_name' => 'البنك الوطني الإسلامي',
            'correction_reason' => 'wrong_amount',
            'correction_notes' => 'تصحيح المبلغ والبنك',
        ])->assertSessionHasNoErrors();

        $this->assertSame('جوال باي', $payment->fresh()->sender_bank_name);
        $this->assertSame('البنك الوطني الإسلامي', $payment->fresh()->correction->sender_bank_name);

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.1.bankName', 'بنك فلسطين')
                ->where('entries.1.senderBankName', 'جوال باي')
                ->where('entries.2.isReversal', true)
                ->where('entries.2.bankName', 'بنك فلسطين')
                ->where('entries.2.senderBankName', 'جوال باي')
                ->where('entries.3.bankName', 'البنك الإسلامي الفلسطيني')
                ->where('entries.3.senderBankName', 'البنك الوطني الإسلامي')
                ->where('entries.3.recorded.bank_name', 'البنك الإسلامي الفلسطيني')
                ->where('entries.3.recorded.sender_bank_name', 'البنك الوطني الإسلامي'));
    }

    public function test_correcting_a_charge_a_discount_and_a_clearing_records_the_right_ones(): void
    {
        $charge = SubscriberTransaction::recordCharge($this->subscriber, $this->branchAdmin, ChargeType::Penalty, '50', 'تأخير');
        $discount = SubscriberTransaction::recordDiscount($this->subscriber, $this->branchAdmin, DiscountMethod::Shekel, '30', null);
        $clearing = SubscriberTransaction::recordClearing($this->subscriber, $this->branchAdmin, '60', 'صيانة المولد');

        $this->correct($charge, ['type' => 'disconnection_fee', 'amount' => '40', 'notes' => 'فصل', 'correction_reason' => 'wrong_type', 'correction_notes' => 'كانت رسوم قطع'])
            ->assertSessionHasNoErrors();
        $this->correct($discount, ['method' => 'shekel', 'value' => '35', 'correction_reason' => 'wrong_amount', 'correction_notes' => 'الخصم 35'])
            ->assertSessionHasNoErrors();
        $this->correct($clearing, ['amount' => '70', 'notes' => 'صيانة المولد والكوابل', 'correction_reason' => 'wrong_amount', 'correction_notes' => 'قيمة الخدمة 70'])
            ->assertSessionHasNoErrors();

        $this->assertSame(['disconnection_fee', '40.00', 'فصل'], [$charge->correction->type, $charge->correction->amount, $charge->correction->notes]);
        $this->assertSame(['discount', '-35.00'], [$discount->correction->type, $discount->correction->amount]);
        $this->assertSame(['clearing', '-70.00', 'صيانة المولد والكوابل'], [$clearing->correction->type, $clearing->correction->amount, $clearing->correction->notes]);
        $this->assertSame(135.0, $this->subscriber->balance());
    }

    public function test_a_subscription_fee_recorded_later_can_be_corrected_with_an_audit_trail(): void
    {
        $charge = SubscriberTransaction::recordCharge($this->subscriber, $this->branchAdmin, ChargeType::SubscriptionFee, '50', null);

        $this->correct($charge, ['type' => 'subscription_fee', 'amount' => '40', 'correction_reason' => 'wrong_amount', 'correction_notes' => 'الرسوم 40'])
            ->assertSessionHasNoErrors()->assertSessionHas('status', 'transaction-corrected');

        $this->assertTrue($charge->fresh()->isCancelled());
        $this->assertDatabaseHas('subscriber_transactions', ['corrects_id' => $charge->id, 'type' => 'subscription_fee', 'amount' => '40.00']);
        $this->assertDatabaseHas('subscriber_transactions', ['reverses_id' => $charge->id, 'type' => 'reversal', 'amount' => '-50.00']);
        $this->assertSame(240.0, $this->subscriber->balance());
    }

    public function test_a_corrected_discount_is_checked_against_the_balance_without_the_one_it_replaces(): void
    {
        $this->subscriber->transactions()->delete();
        SubscriberTransaction::factory()->for($this->subscriber)->create(['amount' => '50.00']);
        $discount = SubscriberTransaction::recordDiscount($this->subscriber, $this->branchAdmin, DiscountMethod::Shekel, '50', null);

        $this->correct($discount, ['method' => 'shekel', 'value' => '45', 'correction_reason' => 'wrong_amount', 'correction_notes' => 'الخصم 45'])
            ->assertSessionHasNoErrors();
        $this->correct($discount->correction, ['method' => 'shekel', 'value' => '60', 'correction_reason' => 'wrong_amount', 'correction_notes' => 'الخصم 60'])
            ->assertSessionHasErrors(['value' => 'لا يمكن أن يزيد الخصم (60 شيكل) عن الرصيد المستحق (50 شيكل).']);
    }

    public function test_deleting_a_line_cancels_it_with_a_reversal_and_keeps_it_on_the_statement(): void
    {
        $payment = $this->recordPayment(['amount' => '80', 'payment_method' => 'cash']);

        $this->actingAs($this->branchAdmin)
            ->from(route('subscribers.statement', $this->subscriber))
            ->delete(route('subscribers.transactions.destroy', [$this->subscriber, $payment]), ['correction_reason' => 'duplicate', 'correction_notes' => 'سُجّلت مرتين'])
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'transaction-deleted');

        $this->assertTrue($payment->refresh()->isCancelled());
        $this->assertNull($payment->correction);
        $this->assertSame(200.0, $this->subscriber->balance());

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->has('entries', 3)
                ->where('entries.1.cancellation.wasCorrected', false)
                ->where('entries.1.cancellation.reasonLabel', 'حركة مكررة')
                ->where('entries.1.canDelete', false)
                ->where('entries.2.type', 'reversal')
                ->where('summary.paid', '0.00')
                ->where('summary.paymentsCount', 0));
    }

    public function test_a_correction_needs_a_reason_that_fits_and_an_explanation(): void
    {
        $payment = $this->recordPayment(['amount' => '80', 'payment_method' => 'cash']);

        $this->correct($payment, $this->transfer('100'))
            ->assertSessionHasErrors(['correction_reason', 'correction_notes']);
        $this->correct($payment, [...$this->transfer('100'), 'correction_reason' => 'duplicate', 'correction_notes' => 'x'])
            ->assertSessionHasErrors('correction_reason');
        $this->correct($payment, ['amount' => '0', 'currency' => 'ILS', 'payment_method' => 'cash', 'correction_reason' => 'wrong_amount', 'correction_notes' => 'x'])
            ->assertSessionHasErrors('amount');

        $this->assertFalse($payment->refresh()->isCancelled());
        $this->assertDatabaseCount('subscriber_transactions', 2);
    }

    public function test_correcting_and_deleting_take_their_own_permissions_within_the_branch(): void
    {
        $payment = $this->recordPayment(['amount' => '80', 'payment_method' => 'cash']);
        $collector = User::factory()->collector()->create(['branch_id' => $this->branch->id]);
        $collector->permissions()->sync(Permission::idsFor([PermissionKey::ViewSubscribers, PermissionKey::RecordCollections, PermissionKey::CorrectTransactions]));
        $deletion = ['correction_reason' => 'duplicate', 'correction_notes' => 'x'];

        $this->actingAs($collector)->delete(route('subscribers.transactions.destroy', [$this->subscriber, $payment]), $deletion)->assertForbidden();
        $this->actingAs(User::factory()->branchAdmin()->create())
            ->put(route('subscribers.transactions.update', [$this->subscriber, $payment]), [...$this->transfer('100'), 'correction_reason' => 'wrong_amount', 'correction_notes' => 'x'])
            ->assertForbidden();
        $this->assertFalse($payment->refresh()->isCancelled());

        $this->actingAs($collector)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page->where('entries.1.canCorrect', true)->where('entries.1.canDelete', false));
    }

    public function test_readings_fees_reversals_and_cancelled_lines_cannot_be_changed(): void
    {
        $fee = $this->subscriber->transactions()->sole();
        $payment = $this->recordPayment(['amount' => '80', 'payment_method' => 'cash']);
        $deletion = ['correction_reason' => 'duplicate', 'correction_notes' => 'x'];

        $this->actingAs($this->branchAdmin)->delete(route('subscribers.transactions.destroy', [$this->subscriber, $fee]), $deletion)->assertForbidden();
        $this->actingAs($this->branchAdmin)->delete(route('subscribers.transactions.destroy', [$this->subscriber, $payment]), $deletion)->assertSessionHasNoErrors();
        $reversal = SubscriberTransaction::where('reverses_id', $payment->id)->sole();

        $this->actingAs($this->branchAdmin)->delete(route('subscribers.transactions.destroy', [$this->subscriber, $payment]), $deletion)->assertForbidden();
        $this->actingAs($this->branchAdmin)->delete(route('subscribers.transactions.destroy', [$this->subscriber, $reversal]), $deletion)->assertForbidden();
        $this->assertSame(200.0, $this->subscriber->balance());
    }

    public function test_a_line_of_another_subscriber_is_not_found(): void
    {
        $other = Subscriber::factory()->create(['branch_id' => $this->branch->id]);
        $payment = SubscriberTransaction::recordPayment($other, $this->branchAdmin, ['amount' => '10', 'currency' => 'ILS', 'payment_method' => 'cash']);

        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.transactions.destroy', [$this->subscriber, $payment]), ['correction_reason' => 'duplicate', 'correction_notes' => 'x'])
            ->assertNotFound();
    }

    public function test_the_financial_log_lists_cancelled_lines_but_leaves_them_out_of_its_figures(): void
    {
        $payment = $this->recordPayment(['amount' => '80', 'payment_method' => 'cash']);
        $this->correct($payment, [...$this->transfer('100'), 'correction_reason' => 'wrong_amount', 'correction_notes' => 'x']);

        $this->actingAs($this->branchAdmin)
            ->get(route('ledger.index', ['filter' => ['type' => 'credit']]))
            ->assertInertia(fn ($page) => $page
                ->where('entries.total', 1)
                ->where('summary.total', 100)
                ->where('summary.collected', 100));

        $this->actingAs($this->branchAdmin)
            ->get(route('ledger.index'))
            ->assertInertia(fn ($page) => $page
                ->where('entries.total', 4)
                ->where('summary.total', 200)
                ->where('summary.collected', 100));
    }

    /**
     * @param  array<string, string>  $details
     */
    private function recordPayment(array $details): SubscriberTransaction
    {
        return SubscriberTransaction::recordPayment($this->subscriber, $this->branchAdmin, ['currency' => 'ILS', ...$details]);
    }

    /**
     * @return array<string, string>
     */
    private function transfer(string $amount): array
    {
        return ['amount' => $amount, 'currency' => 'ILS', 'payment_method' => 'bank_transfer', 'bank_name' => 'بنك فلسطين', 'sender_name' => 'Ahmad', 'reference_number' => 'TR-1'];
    }

    /**
     * @param  array<string, string>  $data
     */
    private function correct(SubscriberTransaction $line, array $data): TestResponse
    {
        return $this->actingAs($this->branchAdmin)
            ->from(route('subscribers.statement', $this->subscriber))
            ->put(route('subscribers.transactions.update', [$this->subscriber, $line]), $data);
    }
}
