<?php

namespace Tests\Feature;

use App\Enums\ChargeType;
use App\Enums\DiscountMethod;
use App\Models\Branch;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubscriberTransactionActionTest extends TestCase
{
    use RefreshDatabase;

    public function test_statement_returns_canonical_available_actions_in_the_required_order(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        $invoice = SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '50', 'غرامة');
        $payment = SubscriberTransaction::recordPayment($subscriber, $actor, [
            'amount' => '20',
            'currency' => 'ILS',
            'payment_method' => 'cash',
        ]);

        $response = $this->actingAs($actor)->get(route('subscribers.statement', $subscriber));

        $response->assertInertia(fn ($page) => $page
            ->where('entries.0.id', $invoice->id)
            ->where('entries.0.available_actions', ['cancel'])
            ->where('entries.1.id', $payment->id)
            ->where('entries.1.available_actions', ['edit_metadata', 'delete']));
    }

    public function test_edit_changes_only_the_last_invoice_amount_and_recomputes_its_balance(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        $invoice = SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '50', 'غرامة');

        $response = $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $invoice]), [
            'action' => 'edit',
            'amount' => '75',
        ]);

        $response->assertSessionHasNoErrors()->assertSessionHas('status', 'transaction-edit');
        $this->assertDatabaseCount('subscriber_transactions', 1);
        $this->assertSame('75.00', $invoice->refresh()->amount);
        $this->assertSame('75.00', $invoice->balance_after);
        $this->assertSame(75.0, $subscriber->balance());
    }

    public function test_non_last_payment_can_be_partially_refunded_and_links_both_rows(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        $payment = SubscriberTransaction::recordPayment($subscriber, $actor, [
            'amount' => '50',
            'currency' => 'ILS',
            'payment_method' => 'cash',
        ]);
        SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '10', 'غرامة');

        $response = $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $payment]), [
            'action' => 'refund',
            'amount' => '20',
        ]);

        $response->assertSessionHasNoErrors();
        $refund = SubscriberTransaction::query()->where('type', 'refund')->sole();
        $this->assertSame($payment->id, $refund->reference_transaction_id);
        $this->assertSame('20.00', $refund->amount);
        $this->assertSame('-20.00', $refund->balance_after);
        $this->assertSame('active', $payment->refresh()->status);

        $this->actingAs($actor)->get(route('subscribers.statement', $subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.0.linkedReversal.id', $refund->id)
                ->where('entries.2.reverses.id', $payment->id));
    }

    public function test_cancel_appends_a_linked_cancellation_and_marks_the_original_cancelled(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        $invoice = SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '50', 'غرامة');
        SubscriberTransaction::recordPayment($subscriber, $actor, [
            'amount' => '20',
            'currency' => 'ILS',
            'payment_method' => 'cash',
        ]);

        $response = $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $invoice]), [
            'action' => 'cancel',
        ]);

        $response->assertSessionHasNoErrors();
        $cancellation = SubscriberTransaction::query()->where('type', 'cancellation')->sole();
        $this->assertSame('cancelled', $invoice->refresh()->status);
        $this->assertSame($invoice->id, $cancellation->reference_transaction_id);
        $this->assertSame('-50.00', $cancellation->amount);
        $this->assertSame('-20.00', $cancellation->balance_after);
    }

    public function test_delete_hard_deletes_only_the_last_transaction(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        $payment = SubscriberTransaction::recordPayment($subscriber, $actor, [
            'amount' => '50',
            'currency' => 'ILS',
            'payment_method' => 'cash',
        ]);

        $response = $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $payment]), [
            'action' => 'delete',
        ]);

        $response->assertSessionHasNoErrors();
        $this->assertModelMissing($payment);
        $this->assertSame(0.0, $subscriber->balance());
    }

    public function test_statement_does_not_offer_edit_metadata_for_a_discount_without_payment_details(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '50', 'غرامة');
        SubscriberTransaction::recordDiscount($subscriber, $actor, DiscountMethod::Shekel, '20', 'البيان الأصلي');

        $response = $this->actingAs($actor)->get(route('subscribers.statement', $subscriber));

        $response->assertInertia(fn ($page) => $page->where('entries.1.available_actions', ['delete']));
    }

    public function test_server_rejects_edit_metadata_for_a_discount_without_payment_details(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '50', 'غرامة');
        $discount = SubscriberTransaction::recordDiscount($subscriber, $actor, DiscountMethod::Shekel, '20', 'البيان الأصلي');

        $response = $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $discount]), [
            'action' => 'edit_metadata',
            'notes' => 'بيان جديد',
        ]);

        $response->assertSessionHasErrors(['action' => 'هذا الإجراء غير مسموح لهذه الحركة.']);
        $this->assertSame('البيان الأصلي', $discount->refresh()->notes);
        $this->assertDatabaseCount('transaction_amendments', 0);
        $this->assertSame(30.0, $subscriber->balance());
    }

    public function test_full_refund_marks_the_original_as_linked_cancellation(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        $payment = SubscriberTransaction::recordPayment($subscriber, $actor, [
            'amount' => '50',
            'currency' => 'ILS',
            'payment_method' => 'cash',
        ]);
        SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '10', 'غرامة');

        $response = $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $payment]), [
            'action' => 'refund',
            'amount' => '50',
        ]);

        $response->assertSessionHasNoErrors();
        $this->assertSame('linked_cancellation', $payment->refresh()->status);
        $this->assertSame(10.0, $subscriber->balance());
    }

    public function test_server_rejects_an_action_not_returned_in_available_actions(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        $payment = SubscriberTransaction::recordPayment($subscriber, $actor, [
            'amount' => '50',
            'currency' => 'ILS',
            'payment_method' => 'cash',
        ]);

        $response = $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $payment]), [
            'action' => 'edit',
            'amount' => '75',
        ]);

        $response->assertSessionHasErrors(['action' => 'هذا الإجراء غير مسموح لهذه الحركة.']);
        $this->assertSame('-50.00', $payment->refresh()->amount);
        $this->assertDatabaseCount('subscriber_transactions', 1);
    }
}
