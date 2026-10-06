<?php

namespace Tests\Feature;

use App\Enums\ChargeType;
use App\Enums\DiscountMethod;
use App\Enums\MeterReadingStatus;
use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\ClosingPayment;
use App\Models\MeterReading;
use App\Models\Permission;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
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
        // The right payment is a bank transfer, which has no voucher number.
        $this->assertNull($replacement->voucher_number);
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
                ->where('entries.1.cancellation.correctionId', $replacement->id)
                ->where('entries.1.cancellation.correctionLineNumber', 4)
                ->where('entries.1.cancellation.reasonLabel', 'مبلغ خاطئ')
                ->where('entries.1.cancellation.byName', 'Sami')
                ->where('entries.1.canCorrect', false)
                ->where('entries.2.id', $reversal->id)
                ->where('entries.2.isFollowUp', true)
                ->where('entries.2.reverses.id', $payment->id)
                ->where('entries.2.reverses.lineNumber', 2)
                ->where('entries.2.isCredit', false)
                ->where('entries.2.description', 'إلغاء: دفعة نقدية · سند '.$payment->printedVoucherNumber())
                ->where('entries.2.balance', '200.00')
                ->where('entries.3.id', $replacement->id)
                ->where('entries.3.isCorrection', true)
                ->where('entries.3.corrects.lineNumber', 2)
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
                ->where('entries.2.voucherNumber', '00412')
                ->where('entries.2.systemVoucherNumber', $payment->printedVoucherNumber())
                ->where('entries.2.manualVoucherNumber', '00412')
                ->where('entries.2.cashBox', '4554')
                ->where('entries.3.groupId', $payment->correction->id)
                ->where('entries.3.corrects.id', $payment->id)
                ->where('entries.3.voucherNumber', '00413')
                ->where('entries.3.manualVoucherNumber', '00413')
                ->where('entries.3.recorded.manual_voucher_number', '00413')
                ->where('entries.3.recorded.cash_box', '4554'));
    }

    public function test_a_payment_taken_in_dollars_before_is_corrected_in_shekels_only(): void
    {
        $payment = $this->recordPayment(['amount' => '20', 'currency' => 'USD', 'exchange_rate' => '3.7', 'payment_method' => 'cash']);

        $this->correct($payment, ['amount' => '20', 'currency' => 'USD', 'exchange_rate' => '3.7', 'payment_method' => 'cash', 'correction_reason' => 'wrong_amount', 'correction_notes' => 'اختبار'])
            ->assertSessionHasErrors('currency');
        $this->assertFalse($payment->fresh()->isCancelled());

        $this->correct($payment, ['amount' => '74', 'currency' => 'ILS', 'payment_method' => 'cash', 'correction_reason' => 'wrong_amount', 'correction_notes' => 'اختبار'])
            ->assertSessionHasNoErrors();

        $replacement = SubscriberTransaction::where('corrects_id', $payment->id)->sole();
        $this->assertSame(['-74.00', 'ILS'], [$replacement->amount, $replacement->currency->value]);
        $this->assertTrue($payment->fresh()->isCancelled());
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
                ->where('entries.2.id', $charge->id)
                ->where('entries.3.type', 'reversal')
                ->where('entries.3.isFollowUp', true)
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
            'sender_bank_name' => 'البنك الإسلامي العربي',
            'correction_reason' => 'wrong_amount',
            'correction_notes' => 'تصحيح المبلغ والبنك',
        ])->assertSessionHasNoErrors();

        $this->assertSame('جوال باي', $payment->fresh()->sender_bank_name);
        $this->assertSame('البنك الإسلامي العربي', $payment->fresh()->correction->sender_bank_name);

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.1.bankName', 'بنك فلسطين')
                ->where('entries.1.senderBankName', 'جوال باي')
                ->where('entries.2.isReversal', true)
                ->where('entries.2.bankName', 'بنك فلسطين')
                ->where('entries.2.senderBankName', 'جوال باي')
                ->where('entries.3.bankName', 'البنك الإسلامي الفلسطيني')
                ->where('entries.3.senderBankName', 'البنك الإسلامي العربي')
                ->where('entries.3.recorded.bank_name', 'البنك الإسلامي الفلسطيني')
                ->where('entries.3.recorded.sender_bank_name', 'البنك الإسلامي العربي'));
    }

    public function test_amending_payment_details_keeps_the_financial_line_and_records_every_change(): void
    {
        $payment = $this->recordPayment([
            ...$this->transfer('25'),
            'sender_bank_name' => 'جوال باي',
            'notes' => 'البيان الأول',
        ]);
        $balance = $this->subscriber->balance();
        $recordedAt = $payment->created_at->toJSON();
        $financialFields = $payment->only([
            'subscriber_id',
            'type',
            'amount',
            'currency',
            'currency_amount',
            'exchange_rate',
            'payment_method',
            'voucher_number',
        ]);

        $this->amend($payment, [
            'bank_name' => 'البنك الإسلامي الفلسطيني',
            'sender_bank_name' => 'البنك الإسلامي العربي',
            'sender_name' => 'أحمد محمد',
            'notes' => 'تم تدقيق الحوالة',
            'amendment_reason' => 'اختير البنك الخطأ عند التسجيل',
        ])
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'transaction-amended');

        $payment->refresh();
        $this->assertSame($financialFields, $payment->only(array_keys($financialFields)));
        $this->assertSame($recordedAt, $payment->created_at->toJSON());
        $this->assertSame($balance, $this->subscriber->balance());
        $this->assertSame(
            ['البنك الإسلامي الفلسطيني', 'البنك الإسلامي العربي', 'أحمد محمد', 'TR-1', 'تم تدقيق الحوالة'],
            [$payment->bank_name, $payment->sender_bank_name, $payment->sender_name, $payment->reference_number, $payment->notes],
        );

        $firstAmendment = $payment->amendments()->sole();
        $this->assertSame($this->branchAdmin->id, $firstAmendment->user_id);
        $this->assertSame('اختير البنك الخطأ عند التسجيل', $firstAmendment->reason);
        $this->assertSame(['بنك فلسطين', 'البنك الإسلامي الفلسطيني'], $firstAmendment->changes['bank_name']);
        $this->assertArrayNotHasKey('reference_number', $firstAmendment->changes);

        $this->amend($payment, [
            'bank_name' => 'البنك الإسلامي الفلسطيني',
            'sender_bank_name' => 'البنك الإسلامي العربي',
            'sender_name' => 'أحمد محمد',
            'reference_number' => 'TR-201',
            'notes' => 'تم تدقيق الحوالة',
            'amendment_reason' => 'تصحيح الرقم المرجعي',
        ])->assertSessionHasErrors('reference_number');
        $this->assertSame('TR-1', $payment->fresh()->reference_number);

        $this->amend($payment, [
            'bank_name' => 'البنك الإسلامي الفلسطيني',
            'sender_bank_name' => 'البنك الإسلامي العربي',
            'sender_name' => 'أحمد محمد',
            'notes' => 'ملاحظة جديدة',
            'amendment_reason' => 'تحديث الملاحظة',
        ])->assertSessionHasNoErrors();

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.1.id', $payment->id)
                ->where('entries.1.isAmended', true)
                ->where('entries.1.canAmend', true)
                ->where('entries.1.amendUnavailableReason', null)
                ->has('entries.1.amendments', 2)
                ->where('entries.1.amendments.0.userName', 'Sami')
                ->where('entries.1.amendments.0.reason', 'اختير البنك الخطأ عند التسجيل')
                ->where('entries.1.amendments.0.changes.0.label', 'البنك المحوّل له')
                ->where('entries.1.amendments.0.changes.0.from', 'بنك فلسطين')
                ->where('entries.1.amendments.0.changes.0.to', 'البنك الإسلامي الفلسطيني')
                ->where('entries.1.amendments.1.reason', 'تحديث الملاحظة')
                ->where('entries.1.amendments.1.changes.0.label', 'الملاحظات')
                ->where('entries.1.amendments.1.changes.0.to', 'ملاحظة جديدة')
                ->where('entries.1.recorded.reference_number', 'TR-1')
                ->where('entries.1.balance', '175.00')
                ->where('summary.balance', '175.00'));
    }

    public function test_amending_details_rejects_financial_fields_and_a_no_op(): void
    {
        $payment = $this->recordPayment(['amount' => '80', 'payment_method' => 'cash', 'notes' => 'نقد']);

        $this->amend($payment, [
            'notes' => 'نقد مصحح',
            'amount' => '100',
            'payment_method' => 'bank_transfer',
            'amendment_reason' => 'محاولة تغيير مالي',
        ])->assertSessionHasErrors(['amount', 'payment_method']);

        $this->assertSame(['-80.00', 'cash', 'نقد'], [$payment->fresh()->amount, $payment->payment_method->value, $payment->notes]);
        $this->assertDatabaseCount('transaction_amendments', 0);

        $this->amend($payment, ['notes' => 'نقد', 'amendment_reason' => 'لا يوجد تغيير'])
            ->assertSessionHasErrors('details');
        $this->assertDatabaseCount('transaction_amendments', 0);
    }

    public function test_payments_in_submitted_or_approved_closings_cannot_be_amended(): void
    {
        $submittedPayment = $this->recordPayment(['amount' => '40', 'payment_method' => 'cash']);
        $approvedPayment = $this->recordPayment(['amount' => '60', 'payment_method' => 'cash']);
        $submitted = Closing::factory()->submitted()->forDay('2026-10-01')->create(['branch_id' => $this->branch->id]);
        $approved = Closing::factory()->approved()->forDay('2026-10-02')->create(['branch_id' => $this->branch->id]);
        ClosingPayment::create(['closing_id' => $submitted->id, 'subscriber_transaction_id' => $submittedPayment->id]);
        ClosingPayment::create(['closing_id' => $approved->id, 'subscriber_transaction_id' => $approvedPayment->id]);

        $this->amend($submittedPayment, ['notes' => 'بعد الإغلاق', 'amendment_reason' => 'x'])->assertForbidden();
        $this->amend($approvedPayment, ['notes' => 'بعد الاعتماد', 'amendment_reason' => 'x'])->assertForbidden();

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.1.canAmend', false)
                ->where('entries.1.amendUnavailableReason', 'بعد إغلاق اليوم')
                ->where('entries.2.canAmend', false)
                ->where('entries.2.amendUnavailableReason', 'بعد إغلاق اليوم'));
        $this->assertDatabaseCount('transaction_amendments', 0);
    }

    public function test_amending_payment_details_requires_the_correction_permission_and_only_applies_to_payments(): void
    {
        $fee = $this->subscriber->transactions()->sole();
        $payment = $this->recordPayment(['amount' => '80', 'payment_method' => 'cash']);
        $collector = User::factory()->collector()->create(['branch_id' => $this->branch->id]);
        $collector->permissions()->sync(Permission::idsFor([PermissionKey::ViewSubscribers, PermissionKey::RecordCollections]));

        $this->actingAs($collector)
            ->patch(route('subscribers.transactions.amend', [$this->subscriber, $payment]), ['notes' => 'x', 'amendment_reason' => 'x'])
            ->assertForbidden();
        $this->actingAs($this->branchAdmin)
            ->patch(route('subscribers.transactions.amend', [$this->subscriber, $fee]), ['notes' => 'x', 'amendment_reason' => 'x'])
            ->assertForbidden();

        $this->actingAs($collector)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.1.canAmend', false)
                ->where('entries.1.amendUnavailableReason', null));
        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.0.canAmend', false)
                ->where('entries.0.amendUnavailableReason', 'متاح للدفعات فقط'));
        $this->assertDatabaseCount('transaction_amendments', 0);
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

    public function test_a_corrected_clearing_is_checked_against_the_balance_without_the_one_it_replaces(): void
    {
        $clearing = SubscriberTransaction::recordClearing($this->subscriber, $this->branchAdmin, '60', 'صيانة المولد');

        // Without it the subscriber owes 200: a clearing of 201 is too much, 200 is the whole debt.
        $this->correct($clearing, ['amount' => '201', 'notes' => 'صيانة', 'correction_reason' => 'wrong_amount', 'correction_notes' => 'اختبار'])
            ->assertSessionHasErrors(['amount' => 'لا يمكن أن تزيد المقاصة (201 شيكل) عن الرصيد المستحق (200 شيكل).']);
        $this->assertFalse($clearing->fresh()->isCancelled());

        $this->correct($clearing, ['amount' => '200', 'notes' => 'صيانة', 'correction_reason' => 'wrong_amount', 'correction_notes' => 'اختبار'])
            ->assertSessionHasNoErrors();
        $this->assertSame(0.0, $this->subscriber->balance());
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

    public function test_a_subscription_fee_recorded_by_hand_uses_the_regular_charge_deletion_reasons(): void
    {
        $charge = SubscriberTransaction::recordCharge($this->subscriber, $this->branchAdmin, ChargeType::SubscriptionFee, '50', null);

        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.transactions.destroy', [$this->subscriber, $charge]), ['correction_reason' => 'fee_cancelled', 'correction_notes' => 'x'])
            ->assertSessionHasErrors('correction_reason');
        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.transactions.destroy', [$this->subscriber, $charge]), ['correction_reason' => 'duplicate', 'correction_notes' => 'سُجّلت مرتين'])
            ->assertSessionHasNoErrors();

        $this->assertSame('duplicate', $charge->refresh()->cancellation_reason->value);
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

    public function test_a_registration_fee_can_be_deleted_with_a_reason_but_not_corrected(): void
    {
        $fee = $this->subscriber->transactions()->sole();

        $this->actingAs($this->branchAdmin)
            ->put(route('subscribers.transactions.update', [$this->subscriber, $fee]), ['correction_reason' => 'wrong_amount', 'correction_notes' => 'x'])
            ->assertForbidden();
        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.transactions.destroy', [$this->subscriber, $fee]), ['correction_reason' => 'payment_refunded', 'correction_notes' => 'x'])
            ->assertSessionHasErrors('correction_reason');
        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.transactions.destroy', [$this->subscriber, $fee]), ['correction_reason' => 'fee_cancelled', 'correction_notes' => 'الرسوم أُعفي منها'])
            ->assertSessionHasNoErrors();

        $this->assertSame(['fee_cancelled', 'الرسوم أُعفي منها'], [$fee->refresh()->cancellation_reason->value, $fee->cancellation_notes]);
        $this->assertSame(0.0, $this->subscriber->balance());
    }

    public function test_a_payment_can_be_deleted_as_refunded(): void
    {
        $payment = $this->recordPayment(['amount' => '80', 'payment_method' => 'cash']);

        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.transactions.destroy', [$this->subscriber, $payment]), ['correction_reason' => 'payment_refunded', 'correction_notes' => 'استرجع المبلغ'])
            ->assertSessionHasNoErrors();

        $this->assertSame('payment_refunded', $payment->refresh()->cancellation_reason->value);
    }

    public function test_erasing_a_line_for_good_takes_its_own_permission(): void
    {
        $fee = $this->subscriber->transactions()->sole();
        $erasure = ['correction_notes' => 'سُجّلت بالخطأ'];

        $this->actingAs($this->branchAdmin)->delete(route('subscribers.transactions.force-destroy', [$this->subscriber, $fee]), $erasure)->assertForbidden();
        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page->where('entries.0.canDelete', true)->where('entries.0.canForceDelete', false));

        $this->grantPermanentDeletionTo($this->branchAdmin);

        $this->actingAs($this->branchAdmin)->delete(route('subscribers.transactions.force-destroy', [$this->subscriber, $fee]), ['correction_notes' => ''])->assertSessionHasErrors('correction_notes');
        Log::spy();

        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.transactions.force-destroy', [$this->subscriber, $fee]), $erasure)
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'transaction-erased');

        $this->assertDatabaseMissing('subscriber_transactions', ['id' => $fee->id]);
        $this->assertSame(0.0, $this->subscriber->balance());
        Log::shouldHaveReceived('warning')->once()->withArgs(fn (string $message, array $context): bool => $message === 'Transaction erased for good'
            && $context['transactions'][0]['id'] === $fee->id
            && $context['transactions'][0]['source_key'] === $fee->source_key
            && $context['erased_by']['id'] === $this->branchAdmin->id
            && $context['reason'] === 'سُجّلت بالخطأ');

        $this->assertDatabaseHas('transaction_deletions', [
            'subscriber_id' => $this->subscriber->id,
            'user_id' => $this->branchAdmin->id,
            'action' => 'erase',
            'reason' => 'سُجّلت بالخطأ',
        ]);
    }

    public function test_permanent_deletion_permission_also_offers_normal_deletion_for_the_last_line(): void
    {
        $payment = $this->recordPayment(['amount' => '80', 'payment_method' => 'cash']);
        $this->branchAdmin->permissions()->detach(Permission::idsFor([PermissionKey::DeleteTransactions]));
        $this->grantPermanentDeletionTo($this->branchAdmin);

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.0.canDelete', false)
                ->where('entries.0.canForceDelete', false)
                ->where('entries.1.canDelete', true)
                ->where('entries.1.canForceDelete', true));

        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.transactions.destroy', [$this->subscriber, $payment]), [
                'correction_reason' => 'payment_refunded',
                'correction_notes' => 'استرجع المبلغ',
            ])
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'transaction-deleted');

        $this->assertTrue($payment->refresh()->isCancelled());
        $this->assertDatabaseHas('subscriber_transactions', ['reverses_id' => $payment->id]);
    }

    public function test_only_the_last_line_of_the_statement_can_be_erased(): void
    {
        $this->grantPermanentDeletionTo($this->branchAdmin);
        $fee = $this->subscriber->transactions()->sole();
        $payment = $this->recordPayment(['amount' => '80', 'payment_method' => 'cash']);

        $this->actingAs($this->branchAdmin)->delete(route('subscribers.transactions.force-destroy', [$this->subscriber, $fee]), ['correction_notes' => 'x'])->assertForbidden();
        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page->where('entries.0.canForceDelete', false)->where('entries.1.canForceDelete', true));

        $this->actingAs($this->branchAdmin)->delete(route('subscribers.transactions.force-destroy', [$this->subscriber, $payment]), ['correction_notes' => 'x'])->assertSessionHasNoErrors();

        $this->assertDatabaseMissing('subscriber_transactions', ['id' => $payment->id]);
        $this->assertDatabaseHas('subscriber_transactions', ['id' => $fee->id]);
    }

    public function test_erasing_a_last_reversal_takes_the_cancelled_line_with_it_and_keeps_the_balance(): void
    {
        $this->grantPermanentDeletionTo($this->branchAdmin);
        $payment = $this->recordPayment(['amount' => '80', 'payment_method' => 'cash']);
        $this->actingAs($this->branchAdmin)->delete(route('subscribers.transactions.destroy', [$this->subscriber, $payment]), ['correction_reason' => 'duplicate', 'correction_notes' => 'x']);
        $reversal = SubscriberTransaction::where('reverses_id', $payment->id)->sole();

        $this->actingAs($this->branchAdmin)->delete(route('subscribers.transactions.force-destroy', [$this->subscriber, $payment]), ['correction_notes' => 'x'])->assertForbidden();
        Log::spy();
        $this->actingAs($this->branchAdmin)->delete(route('subscribers.transactions.force-destroy', [$this->subscriber, $reversal]), ['correction_notes' => 'x'])->assertSessionHasNoErrors();

        $this->assertDatabaseMissing('subscriber_transactions', ['id' => $payment->id]);
        $this->assertDatabaseMissing('subscriber_transactions', ['id' => $reversal->id]);
        $this->assertSame(200.0, $this->subscriber->balance());
        Log::shouldHaveReceived('warning')->once()->withArgs(fn (string $message, array $context): bool => $message === 'Transaction erased for good'
            && collect($context['transactions'])->pluck('id')->all() === [$payment->id, $reversal->id]);
    }

    public function test_a_reversal_grouped_above_a_newer_line_is_not_the_last_line_of_the_statement(): void
    {
        $this->grantPermanentDeletionTo($this->branchAdmin);
        $payment = $this->recordPayment(['amount' => '80', 'payment_method' => 'cash']);
        $charge = SubscriberTransaction::recordCharge($this->subscriber, $this->branchAdmin, ChargeType::Penalty, '20', null);
        $this->actingAs($this->branchAdmin)->delete(route('subscribers.transactions.destroy', [$this->subscriber, $payment]), [
            'correction_reason' => 'duplicate',
            'correction_notes' => 'x',
        ]);
        $reversal = SubscriberTransaction::where('reverses_id', $payment->id)->sole();

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.2.id', $charge->id)
                ->where('entries.2.canForceDelete', true)
                ->where('entries.3.id', $reversal->id)
                ->where('entries.3.canForceDelete', false));
        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.transactions.force-destroy', [$this->subscriber, $reversal]), ['correction_notes' => 'x'])
            ->assertForbidden();
        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.transactions.force-destroy', [$this->subscriber, $charge]), ['correction_notes' => 'x'])
            ->assertSessionHasNoErrors();

        $this->assertDatabaseHas('subscriber_transactions', ['id' => $reversal->id]);
        $this->assertDatabaseMissing('subscriber_transactions', ['id' => $charge->id]);
        $this->assertSame(200.0, $this->subscriber->balance());
    }

    public function test_a_permanently_erased_payment_voucher_number_is_never_reused(): void
    {
        $this->grantPermanentDeletionTo($this->branchAdmin);
        $erased = $this->recordPayment(['amount' => '80', 'payment_method' => 'cash']);

        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.transactions.force-destroy', [$this->subscriber, $erased]), ['correction_notes' => 'سند ملغى'])
            ->assertSessionHasNoErrors();
        $next = $this->recordPayment(['amount' => '90', 'payment_method' => 'cash']);

        $this->assertSame($erased->voucher_number + 1, $next->voucher_number);
        $this->assertDatabaseMissing('subscriber_transactions', ['id' => $erased->id]);
    }

    public function test_a_payment_counted_in_a_closing_cannot_be_permanently_erased(): void
    {
        $this->grantPermanentDeletionTo($this->branchAdmin);
        $payment = $this->recordPayment(['amount' => '80', 'payment_method' => 'cash']);
        $closing = Closing::factory()->create(['branch_id' => $this->branch->id]);
        ClosingPayment::create(['closing_id' => $closing->id, 'subscriber_transaction_id' => $payment->id]);

        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.transactions.force-destroy', [$this->subscriber, $payment]), ['correction_notes' => 'x'])
            ->assertForbidden();

        $this->assertDatabaseHas('subscriber_transactions', ['id' => $payment->id]);
    }

    public function test_permanent_deletion_is_limited_to_the_users_branch_but_a_super_admin_can_use_it_in_any_branch(): void
    {
        $this->grantPermanentDeletionTo($this->branchAdmin);
        $otherBranch = Branch::factory()->create();
        $otherSubscriber = Subscriber::factory()->create(['branch_id' => $otherBranch->id]);
        $fee = SubscriberTransaction::factory()->for($otherSubscriber)->create();

        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.transactions.force-destroy', [$otherSubscriber, $fee]), ['correction_notes' => 'x'])
            ->assertForbidden();
        $this->actingAs(User::factory()->superAdmin()->create())
            ->delete(route('subscribers.transactions.force-destroy', [$otherSubscriber, $fee]), ['correction_notes' => 'x'])
            ->assertSessionHasNoErrors();

        $this->assertDatabaseMissing('subscriber_transactions', ['id' => $fee->id]);
    }

    public function test_erasing_a_weekly_reading_charge_leaves_its_reading_approved(): void
    {
        $this->grantPermanentDeletionTo($this->branchAdmin);
        $reading = MeterReading::factory()->for($this->subscriber)->create([
            'branch_id' => $this->branch->id,
            'recorded_by' => $this->branchAdmin->id,
            'previous_reading' => 1000,
            'current_reading' => 1010,
            'consumption' => 10,
            'unit_price' => '3.00',
            'reading_fee' => '30.00',
            'minimum_payment' => '0.00',
            'discount_amount' => '0.00',
            'amount_due' => '30.00',
        ]);
        $reading->approve($this->branchAdmin);
        $charge = SubscriberTransaction::where('meter_reading_id', $reading->id)->where('type', 'meter_reading')->sole();

        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.transactions.force-destroy', [$this->subscriber, $charge]), ['correction_notes' => 'قراءة أضيفت بالخطأ'])
            ->assertSessionHasNoErrors();

        $this->assertSame(MeterReadingStatus::Approved, $reading->fresh()->status);
        $this->assertDatabaseMissing('subscriber_transactions', ['id' => $charge->id]);
        $this->assertSame(200.0, $this->subscriber->balance());
    }

    public function test_a_weekly_reading_charge_and_standing_discount_can_be_deleted_without_reopening_or_rebilling_the_reading(): void
    {
        $reading = MeterReading::factory()->for($this->subscriber)->create([
            'branch_id' => $this->branch->id,
            'recorded_by' => $this->branchAdmin->id,
            'previous_reading' => 1000,
            'current_reading' => 1010,
            'consumption' => 10,
            'unit_price' => '3.00',
            'reading_fee' => '30.00',
            'minimum_payment' => '0.00',
            'discount_method' => DiscountMethod::Shekel,
            'discount_value' => '0.50',
            'discount_segment' => 'عائلات محتاجة',
            'discount_amount' => '5.00',
            'amount_due' => '25.00',
        ]);
        $reading->approve($this->branchAdmin);

        $charge = SubscriberTransaction::where('meter_reading_id', $reading->id)->where('type', 'meter_reading')->sole();
        $discount = SubscriberTransaction::where('meter_reading_id', $reading->id)->where('type', 'reading_discount')->sole();

        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.transactions.destroy', [$this->subscriber, $charge]), ['correction_reason' => 'wrong_reading', 'correction_notes' => 'تم تحميل قراءة غير صحيحة'])
            ->assertSessionHasNoErrors();
        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.transactions.destroy', [$this->subscriber, $discount]), ['correction_reason' => 'wrong_subscriber', 'correction_notes' => 'الخصم لمشترك آخر'])
            ->assertSessionHasNoErrors();

        $this->assertSame(MeterReadingStatus::Approved, $reading->fresh()->status);
        $this->assertSame($reading->chargeSourceKey(), $charge->refresh()->source_key);
        $this->assertSame($reading->discountSourceKey(), $discount->refresh()->source_key);
        $this->assertDatabaseHas('subscriber_transactions', ['reverses_id' => $charge->id, 'amount' => '-30.00']);
        $this->assertDatabaseHas('subscriber_transactions', ['reverses_id' => $discount->id, 'amount' => '5.00']);
        $this->assertSame(200.0, $this->subscriber->balance());

        $this->assertTrue($reading->correct(1012, 'تصحيح لاحق', $this->branchAdmin));
        $reading->approve($this->branchAdmin);

        $this->assertSame(MeterReadingStatus::Approved, $reading->fresh()->status);
        $this->assertSame(0, SubscriberTransaction::query()
            ->where('meter_reading_id', $reading->id)
            ->whereIn('type', ['meter_reading', 'reading_discount'])
            ->whereNull('cancelled_at')
            ->count());
        $this->assertSame(200.0, $this->subscriber->balance());
    }

    public function test_reversals_and_cancelled_lines_cannot_be_deleted_again(): void
    {
        $payment = $this->recordPayment(['amount' => '80', 'payment_method' => 'cash']);
        $deletion = ['correction_reason' => 'duplicate', 'correction_notes' => 'x'];

        $this->actingAs($this->branchAdmin)->delete(route('subscribers.transactions.destroy', [$this->subscriber, $payment]), $deletion)->assertSessionHasNoErrors();
        $reversal = SubscriberTransaction::where('reverses_id', $payment->id)->sole();

        $this->actingAs($this->branchAdmin)->delete(route('subscribers.transactions.destroy', [$this->subscriber, $payment]), $deletion)->assertForbidden();
        $this->actingAs($this->branchAdmin)->delete(route('subscribers.transactions.destroy', [$this->subscriber, $reversal]), $deletion)->assertForbidden();
        $this->assertSame(200.0, $this->subscriber->balance());
    }

    public function test_deletion_is_limited_to_the_users_branch_but_a_super_admin_can_delete_in_any_branch(): void
    {
        $otherBranch = Branch::factory()->create();
        $otherSubscriber = Subscriber::factory()->create(['branch_id' => $otherBranch->id]);
        $fee = SubscriberTransaction::factory()->for($otherSubscriber)->create();
        $deletion = ['correction_reason' => 'fee_cancelled', 'correction_notes' => 'أُلغيت الرسوم'];

        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.transactions.destroy', [$otherSubscriber, $fee]), $deletion)
            ->assertForbidden();
        $this->assertFalse($fee->refresh()->isCancelled());

        $this->actingAs(User::factory()->superAdmin()->create())
            ->delete(route('subscribers.transactions.destroy', [$otherSubscriber, $fee]), $deletion)
            ->assertSessionHasNoErrors();
        $this->assertTrue($fee->refresh()->isCancelled());
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

    /**
     * @param  array<string, string>  $data
     */
    private function amend(SubscriberTransaction $line, array $data): TestResponse
    {
        return $this->actingAs($this->branchAdmin)
            ->from(route('subscribers.statement', $this->subscriber))
            ->patch(route('subscribers.transactions.amend', [$this->subscriber, $line]), $data);
    }

    private function grantPermanentDeletionTo(User $user): void
    {
        $user->permissions()->syncWithoutDetaching(Permission::idsFor([PermissionKey::ForceDeleteTransactions]));
        $user->unsetRelation('permissions');
    }
}
