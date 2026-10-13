<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\CashBoxPayment;
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

    private function entry(Branch $branch, User $collector, string $amount = '100'): CashBoxPayment
    {
        $payment = SubscriptionTransaction::recordPayment(Subscription::factory()->for($branch)->create(), $collector, ['amount' => $amount, 'currency' => 'ILS', 'payment_method' => 'cash']);

        return CashBoxPayment::query()->where('subscription_transaction_id', $payment->id)->sole();
    }

    public function test_collector_sees_every_entry_with_its_box_and_can_narrow_to_returned_ones(): void
    {
        [$branch, $head, $collector] = $this->start();
        $kept = $this->entry($branch, $collector, '100');
        $returned = $this->entry($branch, $collector, '250');
        $this->entry($branch, User::factory()->collector()->for($branch)->create(), '999');
        app(BranchClosingWorkflow::class)->returnEntry($returned, $head, 'راجع رقم السند');

        $this->actingAs($collector)->get(route('payments.entries'))->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Payments/Entries')
            ->where('scope', 'own')
            ->where('entries.total', 2)
            ->where('counts', ['all' => 2, 'returned' => 1, 'waiting' => 1, 'replied' => 0])
            ->where('entries.data.1.id', $kept->id)
            ->where('entries.data.1.box.number', $kept->box->number)
            ->where('entries.data.1.box.url', route('payments.cash-boxes.show', $kept->box)));

        $this->get(route('payments.entries', ['filter' => ['state' => 'waiting']]))->assertInertia(fn (AssertableInertia $page) => $page
            ->where('entries.total', 1)
            ->where('entries.data.0.id', $returned->id)
            ->where('entries.data.0.returned.note', 'راجع رقم السند')
            ->where('entries.data.0.returned.replyUrl', route('payments.cash-box-entries.reply', $returned))
            ->where('filters.filter.state', 'waiting'));
    }

    public function test_closer_sees_staff_entries_with_their_collector_and_a_link_that_opens_the_box(): void
    {
        [$branch, $head, $collector] = $this->start();
        $entry = $this->entry($branch, $collector);
        app(BranchClosingWorkflow::class)->returnEntry($entry, $head, 'المبلغ ناقص');
        $entry->refresh()->forceFill(['collector_reply' => 'صحّحته', 'replied_at' => now()])->save();

        $this->actingAs($head)->get(route('payments.cash-boxes.branch-entries', ['filter' => ['state' => 'replied'], 'search' => $entry->box->number]))->assertInertia(fn (AssertableInertia $page) => $page
            ->component('Payments/Entries')
            ->where('scope', 'branch')
            ->where('entries.total', 1)
            ->where('entries.data.0.collector', 'سامي')
            ->where('entries.data.0.returned.reply', 'صحّحته')
            ->where('entries.data.0.box.url', route('payments.cash-boxes.branch', ['branch_id' => $branch->id, 'box' => $entry->cash_box_id])));
    }

    public function test_each_entries_page_stays_closed_to_those_without_its_access(): void
    {
        [$branch, $head, $collector] = $this->start();
        $staff = User::factory()->accountant()->for($branch)->create();

        $this->actingAs($collector)->get(route('payments.cash-boxes.branch-entries'))->assertForbidden();
        $this->actingAs($staff)->get(route('payments.cash-boxes.branch-entries'))->assertForbidden();
        $this->actingAs(User::factory()->dataEntry()->for($branch)->create())->get(route('payments.entries'))->assertForbidden();
    }
}
