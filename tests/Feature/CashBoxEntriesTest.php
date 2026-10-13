<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\CashBoxPayment;
use App\Models\Permission;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Support\BranchClosingWorkflow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class CashBoxEntriesTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{Branch, User, User} */
    private function start(): array
    {
        $this->travelTo(now()->setDate(2026, 10, 11)->setTime(10, 0));
        $branch = Branch::factory()->create();
        $head = User::factory()->branchAdmin()->for($branch)->create();
        $collector = User::factory()->collector()->for($branch)->create(['name' => 'سامي']);
        app(BranchClosingWorkflow::class)->start($branch->id, $head);

        return [$branch, $head, $collector];
    }

    private function entry(Branch $branch, User $collector, string $amount = '100', string $method = 'cash'): CashBoxPayment
    {
        $payment = SubscriptionTransaction::recordPayment(Subscription::factory()->for($branch)->create(), $collector, [
            'amount' => $amount, 'currency' => 'ILS', 'payment_method' => $method,
            ...($method === 'bank_transfer' ? ['bank_name' => 'بنك فلسطين', 'sender_bank_name' => 'جوال باي', 'reference_number' => 'TRX-77'] : []),
        ]);

        return CashBoxPayment::query()->where('subscription_transaction_id', $payment->id)->sole();
    }

    public function test_collector_sees_every_entry_as_the_statement_shows_it_with_its_box_and_can_narrow_to_a_type_of_box(): void
    {
        [$branch, , $collector] = $this->start();
        $cash = $this->entry($branch, $collector, '100');
        $transfer = $this->entry($branch, $collector, '250', 'bank_transfer');
        $this->entry($branch, User::factory()->collector()->for($branch)->create(), '999');

        $this->actingAs($collector)->get(route('payments.entries'))->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Payments/Entries')
            ->where('scope', 'own')
            ->where('entries.total', 2)
            ->where('counts', ['all' => 2, 'cash' => 1, 'bank_transfer' => 1, 'clearing' => 0])
            ->where('entries.data.1.id', $cash->id)
            ->where('entries.data.1.box.number', $cash->box->number)
            ->where('entries.data.1.box.url', route('payments.cash-boxes.show', $cash->box))
            ->where('entries.data.1.ledger.voucherNumber', $cash->transaction->displayVoucherNumber())
            ->where('entries.data.1.ledger.description', 'دفعة نقدية')
            ->where('entries.data.1.ledger.recordedByName', 'سامي'));

        $this->get(route('payments.entries', ['filter' => ['type' => 'bank_transfer']]))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('entries.total', 1)
            ->where('entries.data.0.id', $transfer->id)
            ->where('entries.data.0.box.number', $transfer->box->number)
            ->where('entries.data.0.ledger.referenceNumber', 'TRX-77')
            ->where('entries.data.0.ledger.bankName', 'بنك فلسطين')
            ->where('entries.data.0.ledger.senderBankName', 'جوال باي')
            ->where('entries.data.0.ledger.typeLabel', 'دفعة')
            ->where('filters.filter.type', 'bank_transfer'));
    }

    public function test_closer_sees_staff_entries_with_who_recorded_them_and_a_link_that_opens_the_box(): void
    {
        [$branch, $head, $collector] = $this->start();
        $entry = $this->entry($branch, $collector);

        $this->actingAs($head)->get(route('payments.entries', ['search' => $entry->box->number]))->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Payments/Entries')
            ->where('scope', 'branch')
            ->where('entries.total', 1)
            ->where('entries.data.0.collector', 'سامي')
            ->where('entries.data.0.ledger.recordedByName', 'سامي')
            ->where('entries.data.0.box.url', route('payments.cash-boxes', ['branch_id' => $branch->id, 'box' => $entry->cash_box_id])));
    }

    public function test_closer_sees_every_entry_of_the_branch_their_own_among_them_and_narrows_them_to_one_person(): void
    {
        [$branch, $head, $collector] = $this->start();
        $head->permissions()->syncWithoutDetaching(Permission::idsFor([PermissionKey::RecordCollections]));
        $staffEntry = $this->entry($branch, $collector);
        $ownEntry = $this->entry($branch, $head, '40');

        $this->actingAs($head)->get(route('payments.entries'))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('scope', 'branch')
            ->where('entries.total', 2)
            ->where('people', [['id' => $head->id, 'name' => $head->name], ['id' => $collector->id, 'name' => 'سامي']]));

        $this->get(route('payments.entries', ['filter' => ['user' => $head->id]]))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('entries.total', 1)
            ->where('entries.data.0.id', $ownEntry->id)
            ->where('filters.filter.user', (string) $head->id));
        $this->assertNotSame($staffEntry->cash_box_id, $ownEntry->cash_box_id);
    }

    public function test_the_branch_sees_each_box_entry_as_the_statement_shows_it(): void
    {
        [$branch, $head, $collector] = $this->start();
        $entry = $this->entry($branch, $collector, '250', 'bank_transfer');

        $this->actingAs($head)->get(route('payments.cash-boxes'))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('boxes.0.id', $entry->cash_box_id)
            ->where('boxes.0.payments.0.ledger.referenceNumber', 'TRX-77')
            ->where('boxes.0.payments.0.ledger.paymentMethodLabel', __('Bank Transfer'))
            ->where('boxes.0.payments.0.ledger.recordedByName', 'سامي'));
    }

    public function test_each_entries_page_stays_closed_to_those_without_its_access(): void
    {
        [$branch, $head, $collector] = $this->start();
        $staff = User::factory()->accountant()->for($branch)->create();

        $this->actingAs($collector)->get(route('payments.entries'))->assertInertia(fn (AssertableInertia $page) => $page->where('scope', 'own'));
        $this->actingAs($staff)->get(route('payments.entries'))->assertInertia(fn (AssertableInertia $page) => $page->where('scope', 'own'));
        $this->actingAs(User::factory()->dataEntry()->for($branch)->create())->get(route('payments.entries'))->assertForbidden();
    }
}
