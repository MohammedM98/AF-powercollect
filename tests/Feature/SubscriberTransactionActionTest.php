<?php

namespace Tests\Feature;

use App\Enums\ChargeType;
use App\Enums\ClosingStatus;
use App\Enums\DiscountMethod;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\ClosingPayment;
use App\Models\MeterReading;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\TransactionDeletion;
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
            'amendment_reason' => 'المبلغ الصحيح في المستند',
        ]);

        $response->assertSessionHasNoErrors()->assertSessionHas('status', 'transaction-edit');
        $this->assertDatabaseCount('subscriber_transactions', 1);
        $this->assertSame('75.00', $invoice->refresh()->amount);
        $this->assertSame('75.00', $invoice->balance_after);
        $this->assertSame(75.0, $subscriber->balance());
        $this->assertDatabaseHas('transaction_amendments', [
            'transaction_id' => $invoice->id,
            'user_id' => $actor->id,
            'reason' => 'المبلغ الصحيح في المستند',
        ]);
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
            'correction_notes' => 'دفعة مكررة',
        ]);

        $response->assertSessionHasNoErrors();
        $this->assertModelMissing($payment);
        $this->assertSame(0.0, $subscriber->balance());
        $deletion = TransactionDeletion::sole();
        $this->assertSame([$subscriber->id, $actor->id, 'delete', 'دفعة مكررة'], [$deletion->subscriber_id, $deletion->user_id, $deletion->action, $deletion->reason]);
        $this->assertSame([$payment->id], array_column($deletion->transactions, 'id'));
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
            'amendment_reason' => 'محاولة غير مسموحة',
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

    public function test_non_last_discount_is_cancelled_with_a_type_specific_cancellation_instead_of_a_refund(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '50', 'غرامة');
        $discount = SubscriberTransaction::recordDiscount($subscriber, $actor, DiscountMethod::Shekel, '20', 'خصم اجتماعي');
        SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '5', 'غرامة لاحقة');

        $this->actingAs($actor)->get(route('subscribers.statement', $subscriber))
            ->assertInertia(fn ($page) => $page->where('entries.1.available_actions', ['cancel']));

        $response = $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $discount]), [
            'action' => 'cancel',
            'correction_notes' => 'أُلغي الخصم',
        ]);

        $response->assertSessionHasNoErrors();
        $cancellation = SubscriberTransaction::query()->where('reference_transaction_id', $discount->id)->sole();
        $this->assertSame(SubscriberTransaction::TYPE_CANCELLATION, $cancellation->type);
        $this->assertStringContainsString('إلغاء:', $cancellation->description());
        $this->assertDatabaseMissing('subscriber_transactions', [
            'reference_transaction_id' => $discount->id,
            'type' => SubscriberTransaction::TYPE_REFUND,
        ]);
    }

    public function test_fully_refunded_payment_offers_delete_refund_only_and_delete_linked_tree_actions(): void
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
        $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $payment]), [
            'action' => 'refund',
            'amount' => '50',
        ])->assertSessionHasNoErrors();
        $refund = SubscriberTransaction::query()->where('type', SubscriberTransaction::TYPE_REFUND)->sole();

        $this->actingAs($actor)->get(route('subscribers.statement', $subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.0.available_actions', ['delete_tree'])
                ->where('entries.0.linkedReversals.0.id', $refund->id)
                ->where('entries.2.available_actions', ['delete_reversal']));
    }

    public function test_deleting_only_the_last_refund_reactivates_the_payment_and_rebalances_the_statement(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        $payment = SubscriberTransaction::recordPayment($subscriber, $actor, [
            'amount' => '50',
            'currency' => 'ILS',
            'payment_method' => 'cash',
        ]);
        $charge = SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '10', 'غرامة');
        $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $payment]), [
            'action' => 'refund',
            'amount' => '50',
        ]);
        $refund = SubscriberTransaction::query()->where('type', SubscriberTransaction::TYPE_REFUND)->sole();

        $response = $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $refund]), [
            'action' => 'delete_reversal',
            'correction_notes' => 'الإرجاع سُجل بالخطأ',
        ]);

        $response->assertSessionHasNoErrors()->assertSessionHas('status', 'transaction-delete_reversal');
        $this->assertModelMissing($refund);
        $this->assertSame(SubscriberTransaction::STATUS_ACTIVE, $payment->refresh()->status);
        $this->assertNull($payment->cancelled_at);
        $this->assertSame('-40.00', $charge->refresh()->balance_after);
        $this->assertSame(-40.0, $subscriber->balance());
    }

    public function test_deleting_a_fully_refunded_tree_removes_both_sides_and_rebalances_later_transactions(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        $payment = SubscriberTransaction::recordPayment($subscriber, $actor, [
            'amount' => '50',
            'currency' => 'ILS',
            'payment_method' => 'cash',
        ]);
        $firstCharge = SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '10', 'غرامة أولى');
        $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $payment]), [
            'action' => 'refund',
            'amount' => '50',
        ]);
        $refund = SubscriberTransaction::query()->where('type', SubscriberTransaction::TYPE_REFUND)->sole();
        $lastCharge = SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '20', 'غرامة لاحقة');

        $response = $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $payment]), [
            'action' => 'delete_tree',
            'correction_notes' => 'الدفعة والإرجاع مكرران',
        ]);

        $response->assertSessionHasNoErrors()->assertSessionHas('status', 'transaction-delete_tree');
        $this->assertModelMissing($payment);
        $this->assertModelMissing($refund);
        $this->assertSame('10.00', $firstCharge->refresh()->balance_after);
        $this->assertSame('30.00', $lastCharge->refresh()->balance_after);
        $this->assertSame(30.0, $subscriber->balance());
        $deletion = TransactionDeletion::sole();
        $this->assertSame(['delete_tree', 'الدفعة والإرجاع مكرران'], [$deletion->action, $deletion->reason]);
        $this->assertSame([$payment->id, $refund->id], array_column($deletion->transactions, 'id'));
    }

    public function test_partial_refund_cannot_delete_the_original_and_linked_tree(): void
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
        $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $payment]), [
            'action' => 'refund',
            'amount' => '20',
        ]);

        $response = $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $payment]), [
            'action' => 'delete_tree',
            'correction_notes' => 'محاولة حذف جزئي',
        ]);

        $response->assertSessionHasErrors(['action' => 'هذا الإجراء غير مسموح لهذه الحركة.']);
        $this->assertModelExists($payment);
        $this->assertDatabaseHas('subscriber_transactions', [
            'reference_transaction_id' => $payment->id,
            'type' => SubscriberTransaction::TYPE_REFUND,
            'amount' => '20.00',
        ]);
    }

    public function test_permanent_actions_and_metadata_edits_are_unavailable_for_a_payment_in_a_closed_day(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        $payment = SubscriberTransaction::recordPayment($subscriber, $actor, [
            'amount' => '50',
            'currency' => 'ILS',
            'payment_method' => 'cash',
        ]);
        $closing = Closing::factory()->submitted()->create(['branch_id' => $branch->id]);
        ClosingPayment::create(['closing_id' => $closing->id, 'subscriber_transaction_id' => $payment->id]);

        $this->actingAs($actor)->get(route('subscribers.statement', $subscriber))
            ->assertInertia(fn ($page) => $page->where('entries.0.available_actions', []));

        $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $payment]), [
            'action' => 'delete',
            'correction_notes' => 'لا يجب الحذف',
        ])->assertSessionHasErrors(['action' => 'هذا الإجراء غير مسموح لهذه الحركة.']);

        $this->assertModelExists($payment);
    }

    public function test_deleting_the_last_payment_takes_it_off_a_draft_closing(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        $payment = SubscriberTransaction::recordPayment($subscriber, $actor, [
            'amount' => '50',
            'currency' => 'ILS',
            'payment_method' => 'cash',
        ]);
        $closing = Closing::factory()->create(['branch_id' => $branch->id]);
        $closingLine = ClosingPayment::create(['closing_id' => $closing->id, 'subscriber_transaction_id' => $payment->id]);

        $response = $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $payment]), [
            'action' => 'delete',
            'correction_notes' => 'دفعة مكررة',
        ]);

        $response->assertSessionHasNoErrors()->assertSessionHas('status', 'transaction-delete');
        $this->assertModelMissing($payment);
        $this->assertModelMissing($closingLine);
        $this->assertModelExists($closing);
    }

    public function test_deleting_a_refunded_payment_tree_takes_it_off_a_returned_closing(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        $payment = SubscriberTransaction::recordPayment($subscriber, $actor, [
            'amount' => '50',
            'currency' => 'ILS',
            'payment_method' => 'cash',
        ]);
        $closing = Closing::factory()->create(['branch_id' => $branch->id, 'status' => ClosingStatus::Returned]);
        $closingLine = ClosingPayment::create(['closing_id' => $closing->id, 'subscriber_transaction_id' => $payment->id]);
        SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '10', 'غرامة');
        $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $payment]), [
            'action' => 'refund',
            'amount' => '50',
        ]);
        $refund = SubscriberTransaction::query()->where('type', SubscriberTransaction::TYPE_REFUND)->sole();

        $response = $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $payment]), [
            'action' => 'delete_tree',
            'correction_notes' => 'الدفعة والإرجاع مكرران',
        ]);

        $response->assertSessionHasNoErrors()->assertSessionHas('status', 'transaction-delete_tree');
        $this->assertModelMissing($payment);
        $this->assertModelMissing($refund);
        $this->assertModelMissing($closingLine);
    }

    public function test_a_cancelled_reading_discount_cannot_be_deleted_with_its_cancellation(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        $reading = MeterReading::factory()->approved()->for($subscriber)->create();
        $readingDiscount = $subscriber->transactions()->create([
            'recorded_by' => $actor->id,
            'meter_reading_id' => $reading->id,
            'type' => SubscriberTransaction::TYPE_READING_DISCOUNT,
            'source_key' => $reading->discountSourceKey(),
            'amount' => '-15.00',
            'currency_amount' => '15.00',
            'discount_method' => DiscountMethod::Kilowatt,
            'discount_value' => '3',
        ]);
        SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '10', 'غرامة');
        $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $readingDiscount]), [
            'action' => 'cancel',
        ])->assertSessionHasNoErrors();

        $this->actingAs($actor)->get(route('subscribers.statement', $subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.0.id', $readingDiscount->id)
                ->where('entries.0.available_actions', []));

        $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $readingDiscount]), [
            'action' => 'delete_tree',
            'correction_notes' => 'خصم ملغى',
        ])->assertSessionHasErrors(['action' => 'هذا الإجراء غير مسموح لهذه الحركة.']);

        $this->assertDatabaseHas('subscriber_transactions', [
            'id' => $readingDiscount->id,
            'source_key' => $reading->discountSourceKey(),
        ]);
    }

    public function test_permanent_deletion_actions_require_an_audit_reason(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        $payment = SubscriberTransaction::recordPayment($subscriber, $actor, [
            'amount' => '50',
            'currency' => 'ILS',
            'payment_method' => 'cash',
        ]);

        $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $payment]), [
            'action' => 'delete',
        ])->assertSessionHasErrors('correction_notes');

        $this->assertModelExists($payment);
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
            'amendment_reason' => 'محاولة غير مسموحة',
        ]);

        $response->assertSessionHasErrors(['action' => 'هذا الإجراء غير مسموح لهذه الحركة.']);
        $this->assertSame('-50.00', $payment->refresh()->amount);
        $this->assertDatabaseCount('subscriber_transactions', 1);
    }
}
