<?php

namespace Tests\Feature\Subscribers;

use App\Enums\SubscriberStatus;
use App\Models\CircuitBreaker;
use App\Models\Subscriber;
use App\Models\SubscriberBulkChange;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubscriberBulkChangeTest extends TestCase
{
    use RefreshDatabase;

    private function subscriberOf(User $user, array $attributes = []): Subscriber
    {
        return Subscriber::factory()->create(['branch_id' => $user->branch_id, ...$attributes]);
    }

    public function test_the_minimum_charge_is_set_for_the_ticked_subscribers_and_kept_for_undo(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();
        $first = $this->subscriberOf($branchAdmin, ['minimum_charge' => 10]);
        $second = $this->subscriberOf($branchAdmin, ['minimum_charge' => 15]);
        $alreadySet = $this->subscriberOf($branchAdmin, ['minimum_charge' => 25]);
        $notTicked = $this->subscriberOf($branchAdmin, ['minimum_charge' => 10]);

        $this->actingAs($branchAdmin)
            ->post(route('subscribers.bulk-changes.store'), [
                'field' => 'minimum_charge',
                'mode' => 'amount',
                'value' => '25',
                'ids' => [$first->id, $second->id, $alreadySet->id],
            ])
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'subscribers-bulk-changed');

        $this->assertEquals(25, (float) $first->fresh()->minimum_charge);
        $this->assertEquals(25, (float) $second->fresh()->minimum_charge);
        $this->assertEquals(10, (float) $notTicked->fresh()->minimum_charge);
        $change = SubscriberBulkChange::sole();
        $this->assertSame(2, $change->changed_count);
        $this->assertSame($branchAdmin->branch_id, $change->branch_id);
        $this->assertSame('الحد الأدنى ← 25 شيكل', $change->description);
        $this->assertDatabaseHas('subscriber_bulk_change_items', ['subscriber_id' => $second->id, 'old_value' => '15.00', 'new_value' => '25.00']);
        $this->assertDatabaseMissing('subscriber_bulk_change_items', ['subscriber_id' => $alreadySet->id]);
    }

    public function test_every_subscriber_matching_the_lists_filters_gets_the_new_status_but_never_another_branchs(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();
        $active = $this->subscriberOf($branchAdmin, ['status' => SubscriberStatus::Active]);
        $suspended = $this->subscriberOf($branchAdmin, ['status' => SubscriberStatus::Suspended]);
        $otherBranch = Subscriber::factory()->create(['status' => SubscriberStatus::Active]);

        $this->actingAs($branchAdmin)
            ->post(route('subscribers.bulk-changes.store'), [
                'field' => 'status',
                'value' => SubscriberStatus::Disconnected->value,
                'all' => true,
                'filter' => ['status' => SubscriberStatus::Active->value],
            ])
            ->assertSessionHasNoErrors();

        $this->assertSame(SubscriberStatus::Disconnected, $active->fresh()->status);
        $this->assertSame(SubscriberStatus::Suspended, $suspended->fresh()->status);
        $this->assertSame(SubscriberStatus::Active, $otherBranch->fresh()->status);
    }

    public function test_by_circuit_breaker_each_subscriber_gets_their_breakers_minimum(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();
        $withBreaker = $this->subscriberOf($branchAdmin, ['minimum_charge' => 5, 'circuit_breaker_id' => CircuitBreaker::factory()->create(['minimum_payment' => 40])->id]);
        $withoutBreaker = $this->subscriberOf($branchAdmin, ['minimum_charge' => 5, 'circuit_breaker_id' => null]);

        $this->actingAs($branchAdmin)
            ->post(route('subscribers.bulk-changes.store'), ['field' => 'minimum_charge', 'mode' => 'circuit_breaker', 'ids' => [$withBreaker->id, $withoutBreaker->id]])
            ->assertSessionHasNoErrors();

        $this->assertEquals(40, (float) $withBreaker->fresh()->minimum_charge);
        $this->assertEquals(5, (float) $withoutBreaker->fresh()->minimum_charge);
    }

    public function test_the_minimum_charge_takes_its_own_permission_while_the_status_does_not(): void
    {
        $dataEntry = User::factory()->dataEntry()->create();
        $subscriber = $this->subscriberOf($dataEntry, ['minimum_charge' => 10]);
        $collector = User::factory()->collector()->create(['branch_id' => $dataEntry->branch_id]);

        $this->actingAs($dataEntry)
            ->post(route('subscribers.bulk-changes.store'), ['field' => 'minimum_charge', 'mode' => 'amount', 'value' => 50, 'ids' => [$subscriber->id]])
            ->assertForbidden();
        $this->actingAs($collector)
            ->post(route('subscribers.bulk-changes.store'), ['field' => 'status', 'value' => 'suspended', 'ids' => [$subscriber->id]])
            ->assertForbidden();
        $this->actingAs($dataEntry)
            ->post(route('subscribers.bulk-changes.store'), ['field' => 'status', 'value' => 'suspended', 'ids' => [$subscriber->id]])
            ->assertSessionHasNoErrors();

        $this->assertEquals(10, (float) $subscriber->fresh()->minimum_charge);
        $this->assertSame(SubscriberStatus::Suspended, $subscriber->fresh()->status);
    }

    public function test_ticked_subscribers_of_another_branch_are_left_out(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();
        $foreign = Subscriber::factory()->create(['minimum_charge' => 10]);

        $this->actingAs($branchAdmin)
            ->post(route('subscribers.bulk-changes.store'), ['field' => 'minimum_charge', 'mode' => 'amount', 'value' => 99, 'ids' => [$foreign->id]])
            ->assertSessionHasErrors(['ids' => 'لا يوجد بين المختارين من تتغير قيمته.']);

        $this->assertEquals(10, (float) $foreign->fresh()->minimum_charge);
        $this->assertDatabaseCount('subscriber_bulk_changes', 0);
    }

    public function test_a_bulk_change_needs_its_value_and_subscribers(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();

        $this->actingAs($branchAdmin)
            ->post(route('subscribers.bulk-changes.store'), ['field' => 'minimum_charge', 'mode' => 'amount'])
            ->assertSessionHasErrors(['value' => 'أدخل القيمة الجديدة.', 'ids' => 'اختر مشتركًا واحدًا على الأقل.']);
        $this->actingAs($branchAdmin)
            ->post(route('subscribers.bulk-changes.store'), ['field' => 'status', 'value' => 'archived', 'ids' => [1]])
            ->assertSessionHasErrors('value');
    }

    public function test_undo_puts_back_the_old_values_except_where_changed_since(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();
        $first = $this->subscriberOf($branchAdmin, ['minimum_charge' => 10]);
        $changedSince = $this->subscriberOf($branchAdmin, ['minimum_charge' => 12]);
        $this->actingAs($branchAdmin)->post(route('subscribers.bulk-changes.store'), [
            'field' => 'minimum_charge', 'mode' => 'amount', 'value' => 30, 'ids' => [$first->id, $changedSince->id],
        ]);
        $changedSince->update(['minimum_charge' => 45]);
        $change = SubscriberBulkChange::sole();

        $this->actingAs($branchAdmin)->post(route('subscribers.bulk-changes.undo', $change))->assertSessionHas('status', 'subscribers-bulk-undone');

        $this->assertEquals(10, (float) $first->fresh()->minimum_charge);
        $this->assertEquals(45, (float) $changedSince->fresh()->minimum_charge);
        $change->refresh();
        $this->assertSame(1, $change->restored_count);
        $this->assertSame($branchAdmin->id, $change->undone_by);

        $this->actingAs($branchAdmin)
            ->post(route('subscribers.bulk-changes.undo', $change))
            ->assertSessionHasErrors(['undo' => 'تم التراجع عن هذا التعديل من قبل.']);
    }

    public function test_another_branchs_bulk_change_can_be_neither_seen_nor_undone(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();
        $foreignAdmin = User::factory()->branchAdmin()->create();
        $subscriber = $this->subscriberOf($foreignAdmin, ['minimum_charge' => 10]);
        $this->actingAs($foreignAdmin)->post(route('subscribers.bulk-changes.store'), [
            'field' => 'minimum_charge', 'mode' => 'amount', 'value' => 30, 'ids' => [$subscriber->id],
        ]);
        $change = SubscriberBulkChange::sole();

        $this->actingAs($branchAdmin)->get(route('subscribers.bulk-changes.index'))
            ->assertInertia(fn ($page) => $page->component('Subscribers/BulkChanges')->has('changes.data', 0));
        $this->actingAs($branchAdmin)->post(route('subscribers.bulk-changes.undo', $change))->assertNotFound();

        $this->assertEquals(30, (float) $subscriber->fresh()->minimum_charge);
    }

    public function test_the_log_lists_a_change_and_shows_its_subscribers_before_after_and_now(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();
        $subscriber = $this->subscriberOf($branchAdmin, ['status' => SubscriberStatus::Active]);
        $this->actingAs($branchAdmin)->post(route('subscribers.bulk-changes.store'), ['field' => 'status', 'value' => 'suspended', 'ids' => [$subscriber->id]]);
        $change = SubscriberBulkChange::sole();

        $this->actingAs($branchAdmin)->get(route('subscribers.bulk-changes.index', ['change' => $change->id]))
            ->assertInertia(fn ($page) => $page
                ->where('changes.data.0.description', 'الحالة ← مفصول')
                ->where('changes.data.0.canUndo', true)
                ->reloadOnly('details', fn ($reload) => $reload
                    ->where('details.items.0.name', $subscriber->displayName())
                    ->where('details.items.0.old', 'نشط')
                    ->where('details.items.0.new', 'مفصول')
                    ->where('details.items.0.now', 'مفصول')));
    }

    public function test_the_list_can_be_narrowed_to_chosen_subscribers_for_printing(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();
        $chosen = $this->subscriberOf($branchAdmin);
        $this->subscriberOf($branchAdmin);

        $this->actingAs($branchAdmin)->get(route('subscribers.index', ['filter' => ['ids' => (string) $chosen->id]]))
            ->assertInertia(fn ($page) => $page->has('subscribers.data', 1)->where('subscribers.data.0.id', $chosen->id));
    }
}
