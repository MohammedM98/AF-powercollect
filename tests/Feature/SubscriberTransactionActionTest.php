<?php

namespace Tests\Feature;

use App\Enums\ChargeType;
use App\Enums\ClosingStatus;
use App\Enums\CorrectionReason;
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

    public function test_a_refund_always_returns_the_whole_payment_and_links_both_rows(): void
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
            'correction_notes' => 'المبلغ سُجّل خطأ، تُسجّل الدفعة الصحيحة بعده',
        ]);

        $response->assertSessionHasNoErrors();
        $refund = SubscriberTransaction::query()->where('type', 'refund')->sole();
        $this->assertSame($payment->id, $refund->reference_transaction_id);
        $this->assertSame('50.00', $refund->amount);
        $this->assertSame('10.00', $refund->balance_after);
        $this->assertSame(SubscriberTransaction::STATUS_LINKED_CANCELLATION, $payment->refresh()->status);
        $this->assertSame('المبلغ سُجّل خطأ، تُسجّل الدفعة الصحيحة بعده', $payment->cancellation_notes);

        $this->actingAs($actor)->get(route('subscribers.statement', $subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.0.linkedReversal.id', $refund->id)
                ->where('entries.2.reverses.id', $payment->id));
    }

    public function test_a_refund_cannot_be_for_part_of_a_payment(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        $payment = SubscriberTransaction::recordPayment($subscriber, $actor, ['amount' => '50', 'currency' => 'ILS', 'payment_method' => 'cash']);
        SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '10', 'غرامة');

        $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $payment]), [
            'action' => 'refund',
            'amount' => '20',
        ])->assertSessionHasErrors('amount');

        $this->assertDatabaseMissing('subscriber_transactions', ['type' => SubscriberTransaction::TYPE_REFUND]);
        $this->assertSame(SubscriberTransaction::STATUS_ACTIVE, $payment->refresh()->status);
    }

    public function test_a_payment_partly_refunded_before_refunds_only_what_is_left(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        $payment = SubscriberTransaction::recordPayment($subscriber, $actor, ['amount' => '50', 'currency' => 'ILS', 'payment_method' => 'cash']);
        SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '10', 'غرامة');
        $this->legacyPartialRefund($payment, $actor, '20.00');

        $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $payment]), [
            'action' => 'refund',
        ])->assertSessionHasNoErrors();

        $this->assertSame(['20.00', '30.00'], SubscriberTransaction::query()->where('type', 'refund')->orderBy('id')->pluck('amount')->all());
        $this->assertSame(SubscriberTransaction::STATUS_LINKED_CANCELLATION, $payment->refresh()->status);
        $this->assertSame(10.0, $subscriber->balance());
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
        // Partial refunds can't be made any more, but older ones stay on the books.
        $this->legacyPartialRefund($payment, $actor, '20.00');

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

    public function test_cancelling_a_weekly_reading_cancels_its_standing_discount_with_it(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        [$charge, $discount] = $this->billedReadingWithDiscount($subscriber, $actor);
        SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '10', 'غرامة');

        $this->actingAs($actor)->get(route('subscribers.statement', $subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.0.id', $charge->id)
                ->where('entries.0.readingDiscount', '30')
                ->where('entries.1.readingDiscount', null));

        $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $charge]), [
            'action' => 'cancel',
            'correction_reason' => 'wrong_reading',
            'correction_notes' => 'قراءة مُدخلة بالخطأ',
        ])->assertSessionHasNoErrors();

        $discount->refresh();
        $this->assertNotNull($discount->cancelled_at);
        $this->assertSame('wrong_reading', $discount->cancellation_reason->value);
        $this->assertSame('قراءة مُدخلة بالخطأ', $discount->cancellation_notes);
        $this->assertSame('30.00', SubscriberTransaction::query()->where('reverses_id', $discount->id)->sole()->amount);
        // Only the penalty is left owing: the reading and its discount are both gone from the balance.
        $this->assertSame(10.0, $subscriber->balance());
    }

    public function test_deleting_a_weekly_reading_with_a_reason_reverses_its_standing_discount_with_it(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        [$charge, $discount] = $this->billedReadingWithDiscount($subscriber, $actor);

        $this->actingAs($actor)
            ->delete(route('subscribers.transactions.destroy', [$subscriber, $charge]), ['correction_reason' => 'wrong_reading', 'correction_notes' => 'خطأ'])
            ->assertSessionHasNoErrors();

        $this->assertNotNull($discount->refresh()->cancelled_at);
        $this->assertSame(0.0, $subscriber->balance());
    }

    public function test_a_weekly_reading_discount_cannot_be_cancelled_or_deleted_on_its_own(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->superAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        [$charge, $discount] = $this->billedReadingWithDiscount($subscriber, $actor);

        $this->actingAs($actor)->get(route('subscribers.statement', $subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.1.id', $discount->id)
                ->where('entries.1.available_actions', [])
                ->where('entries.1.reading', null)
                ->where('entries.1.canDelete', false)
                ->where('entries.1.canForceDelete', false));

        $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $discount]), [
            'action' => 'delete',
            'correction_notes' => 'خطأ',
        ])->assertSessionHasErrors(['action' => 'هذا الإجراء غير مسموح لهذه الحركة.']);
        $this->actingAs($actor)
            ->delete(route('subscribers.transactions.destroy', [$subscriber, $discount]), ['correction_reason' => 'wrong_reading', 'correction_notes' => 'خطأ'])
            ->assertForbidden();

        $this->assertNull($discount->refresh()->cancelled_at);
        $this->assertSame(53.4, $subscriber->balance());
    }

    public function test_deleting_the_last_weekly_reading_deletes_its_standing_discount_with_it(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->superAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '10', 'غرامة');
        [$charge, $discount] = $this->billedReadingWithDiscount($subscriber, $actor);

        $this->actingAs($actor)->get(route('subscribers.statement', $subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.1.id', $charge->id)
                ->where('entries.1.available_actions', ['delete'])
                ->where('entries.1.actionEffects.delete', '53.40'));

        $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $charge]), [
            'action' => 'delete',
            'correction_notes' => 'قراءة مُدخلة بالخطأ',
        ])->assertSessionHasNoErrors();

        $this->assertModelMissing($charge);
        $this->assertModelMissing($discount);
        $this->assertSame(10.0, $subscriber->balance());
        $this->assertCount(2, TransactionDeletion::sole()->transactions);
    }

    public function test_the_reversal_of_a_weekly_reading_discount_cannot_be_deleted_to_bring_the_discount_back(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->superAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        [$charge, $discount] = $this->billedReadingWithDiscount($subscriber, $actor);
        $charge->cancel($actor, CorrectionReason::WrongReading, 'خطأ');
        $discountReversal = SubscriberTransaction::query()->where('reverses_id', $discount->id)->sole();

        $this->actingAs($actor)->post(route('subscribers.transactions.actions.store', [$subscriber, $discountReversal]), [
            'action' => 'delete_reversal',
            'correction_notes' => 'خطأ',
        ])->assertSessionHasErrors(['action' => 'هذا الإجراء غير مسموح لهذه الحركة.']);

        $this->assertNotNull($discount->refresh()->cancelled_at);
        $this->assertSame(0.0, $subscriber->balance());
    }

    /**
     * A partial refund of the payment, as one was recorded before refunds
     * became whole-payment only.
     */
    private function legacyPartialRefund(SubscriberTransaction $payment, User $actor, string $amount): SubscriberTransaction
    {
        return $payment->subscriber->transactions()->create([
            'recorded_by' => $actor->id,
            'reverses_id' => $payment->id,
            'reference_transaction_id' => $payment->id,
            'type' => SubscriberTransaction::TYPE_REFUND,
            'status' => SubscriberTransaction::STATUS_ACTIVE,
            'source_key' => 'refund:'.$payment->id.':legacy',
            'amount' => $amount,
            'currency' => $payment->currency,
            'currency_amount' => $amount,
            'exchange_rate' => $payment->exchange_rate,
            'payment_method' => $payment->payment_method,
        ]);
    }

    /**
     * An approved weekly reading billed 83.40 with a 30 standing discount beside it.
     *
     * @return array{0: SubscriberTransaction, 1: SubscriberTransaction}
     */
    private function billedReadingWithDiscount(Subscriber $subscriber, User $actor): array
    {
        $reading = MeterReading::factory()->approved()->for($subscriber)->create();
        $charge = $subscriber->transactions()->create([
            'recorded_by' => $actor->id,
            'meter_reading_id' => $reading->id,
            'type' => SubscriberTransaction::TYPE_METER_READING,
            'source_key' => $reading->chargeSourceKey(),
            'amount' => '83.40',
            'currency_amount' => '83.40',
        ]);
        $discount = $subscriber->transactions()->create([
            'recorded_by' => $actor->id,
            'meter_reading_id' => $reading->id,
            'type' => SubscriberTransaction::TYPE_READING_DISCOUNT,
            'source_key' => $reading->discountSourceKey(),
            'amount' => '-30.00',
            'currency_amount' => '30.00',
            'discount_method' => DiscountMethod::Kilowatt,
            'discount_value' => '1',
        ]);

        return [$charge, $discount];
    }

    public function test_a_cancelled_reading_discount_cannot_be_deleted_with_its_cancellation(): void
    {
        $branch = Branch::factory()->create();
        $actor = User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        [$charge, $readingDiscount] = $this->billedReadingWithDiscount($subscriber, $actor);
        $reading = $charge->meterReading;
        SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '10', 'غرامة');
        $charge->cancel($actor, CorrectionReason::WrongReading, 'خطأ');

        $this->actingAs($actor)->get(route('subscribers.statement', $subscriber))
            ->assertInertia(fn ($page) => $page
                ->where('entries.1.id', $readingDiscount->id)
                ->where('entries.1.available_actions', []));

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
