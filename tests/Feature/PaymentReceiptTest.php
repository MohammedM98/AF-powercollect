<?php

namespace Tests\Feature;

use App\Enums\ChargeType;
use App\Enums\CorrectionReason;
use App\Models\Branch;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PaymentReceiptTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;

    private User $branchAdmin;

    private Subscriber $subscriber;

    protected function setUp(): void
    {
        parent::setUp();

        // 12:40 on 30 August in Gaza (UTC+3), the business's time zone.
        $this->travelTo('2026-08-30 09:40:00');
        $this->branch = Branch::factory()->create(['name' => 'فرع الكرادة']);
        $this->branchAdmin = User::factory()->branchAdmin()->create(['branch_id' => $this->branch->id, 'name' => 'Mohammed']);
        $this->subscriber = Subscriber::factory()->create(['branch_id' => $this->branch->id, 'full_name' => 'Ahmad']);
    }

    public function test_guests_are_sent_to_log_in(): void
    {
        $payment = $this->recordPayment();

        $this->get(route('subscribers.payments.receipt', [$this->subscriber, $payment]))->assertRedirect(route('login'));
    }

    public function test_the_receipt_shows_the_voucher_the_payer_the_amount_and_the_balance_it_left(): void
    {
        SubscriberTransaction::recordCharge($this->subscriber, $this->branchAdmin, ChargeType::Penalty, '100', null);
        $payment = $this->recordPayment(['amount' => '20', 'currency' => 'USD', 'exchange_rate' => '3.7', 'cash_box' => '3', 'manual_voucher_number' => '4471']);

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.payments.receipt', [$this->subscriber, $payment]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Subscribers/PaymentReceipt')
                ->where('subscriber.fullName', 'Ahmad')
                ->where('subscriber.accountNumber', $this->subscriber->account_number)
                ->where('subscriber.branchName', 'فرع الكرادة')
                ->where('receipt.voucherNumber', '4471')
                ->where('receipt.systemVoucherNumber', '000001')
                ->where('receipt.date', '2026-08-30')
                ->where('receipt.time', '12:40')
                ->where('receipt.amount', '20')
                ->where('receipt.currencyLabel', __('Dollar'))
                ->where('receipt.isShekel', false)
                ->where('receipt.inShekels', '74')
                ->where('receipt.exchangeRate', '3.7')
                ->where('receipt.cashBox', '3')
                ->where('receipt.recordedByName', 'Mohammed')
                ->where('receipt.balanceAfter', '26.00')
                ->where('receipt.cancellation', null)
                ->where('printedBy', 'Mohammed'));
    }

    public function test_a_cancelled_payment_prints_marked_as_cancelled(): void
    {
        $payment = $this->recordPayment();
        $this->actingAs($this->branchAdmin)
            ->delete(route('subscribers.transactions.destroy', [$this->subscriber, $payment]), ['correction_reason' => 'duplicate', 'correction_notes' => 'مكررة'])
            ->assertSessionHasNoErrors();

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.payments.receipt', [$this->subscriber, $payment]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('receipt.cancellation.reasonLabel', __(CorrectionReason::Duplicate->label()))
                ->where('receipt.cancellation.byName', 'Mohammed')
                ->where('receipt.cancellation.date', '2026-08-30'));
    }

    public function test_staff_of_another_branch_cannot_open_the_receipt(): void
    {
        $payment = $this->recordPayment();
        $otherAdmin = User::factory()->branchAdmin()->create(['branch_id' => Branch::factory()->create()->id]);

        $this->actingAs($otherAdmin)->get(route('subscribers.payments.receipt', [$this->subscriber, $payment]))->assertForbidden();
    }

    public function test_only_a_payment_of_the_same_subscriber_has_a_receipt(): void
    {
        $charge = SubscriberTransaction::recordCharge($this->subscriber, $this->branchAdmin, ChargeType::Penalty, '100', null);
        $otherSubscriber = Subscriber::factory()->create(['branch_id' => $this->branch->id]);
        $otherPayment = SubscriberTransaction::recordPayment($otherSubscriber, $this->branchAdmin, ['amount' => '10', 'currency' => 'ILS', 'payment_method' => 'cash']);

        $this->actingAs($this->branchAdmin)->get(route('subscribers.payments.receipt', [$this->subscriber, $charge]))->assertNotFound();
        $this->actingAs($this->branchAdmin)->get(route('subscribers.payments.receipt', [$this->subscriber, $otherPayment]))->assertNotFound();
    }

    public function test_a_recorded_payment_hands_its_form_the_receipt_to_print(): void
    {
        $this->followingRedirects()
            ->actingAs($this->branchAdmin)
            ->from(route('subscribers.statement', $this->subscriber))
            ->post(route('subscribers.payments.store', $this->subscriber), ['amount' => '25', 'currency' => 'ILS', 'payment_method' => 'cash'])
            ->assertOk()
            ->assertInertia(fn ($page) => $page->hasFlash(
                'recordedPayment.receiptUrl',
                route('subscribers.payments.receipt', [$this->subscriber, SubscriberTransaction::sole()]),
            ));
    }

    public function test_the_statement_offers_a_receipt_on_payment_lines_only(): void
    {
        SubscriberTransaction::recordCharge($this->subscriber, $this->branchAdmin, ChargeType::Penalty, '100', null);
        $payment = $this->recordPayment();

        $this->actingAs($this->branchAdmin)
            ->get(route('subscribers.statement', $this->subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.0.receiptUrl', null)
                ->where('entries.1.receiptUrl', route('subscribers.payments.receipt', [$this->subscriber, $payment])));
    }

    /**
     * @param  array<string, string>  $details
     */
    private function recordPayment(array $details = []): SubscriberTransaction
    {
        return SubscriberTransaction::recordPayment($this->subscriber, $this->branchAdmin, [
            'amount' => '25',
            'currency' => 'ILS',
            'payment_method' => 'cash',
            ...$details,
        ]);
    }
}
