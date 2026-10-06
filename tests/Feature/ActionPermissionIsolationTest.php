<?php

namespace Tests\Feature;

use App\Enums\ChargeType;
use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\MeterReading;
use App\Models\Permission;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class ActionPermissionIsolationTest extends TestCase
{
    use RefreshDatabase;

    #[TestWith([[], [], []])]
    #[TestWith([['collections.correct'], ['edit'], []])]
    #[TestWith([['collections.force_delete'], ['delete'], []])]
    #[TestWith([['collections.correct', 'collections.force_delete'], ['edit', 'delete'], []])]
    #[TestWith([['collections.delete'], [], []])]
    #[TestWith([['collections.refund'], [], ['refund']])]
    #[TestWith([['collections.amend'], [], ['edit_metadata']])]
    public function test_transaction_buttons_and_requests_follow_the_exact_grants(array $keys, array $invoiceActions, array $paymentActions): void
    {
        $actor = User::factory()->collector()->create();
        $permissions = [PermissionKey::ViewSubscribers, ...array_map(PermissionKey::from(...), $keys)];
        $actor->permissions()->sync(Permission::idsFor($permissions));
        $subscriber = Subscriber::factory()->create(['branch_id' => $actor->branch_id]);
        $payment = SubscriberTransaction::recordPayment($subscriber, $actor, ['amount' => '20', 'currency' => 'ILS', 'payment_method' => 'cash']);
        $invoice = SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '50', 'غرامة');

        $this->actingAs($actor)->get(route('subscribers.statement', $subscriber))->assertInertia(fn ($page) => $page
            ->where('entries.0.available_actions', $paymentActions)
            ->where('entries.1.available_actions', $invoiceActions));

        foreach (['edit', 'delete', 'cancel'] as $action) {
            if (in_array($action, $invoiceActions, true)) {
                continue;
            }
            $this->post(route('subscribers.transactions.actions.store', [$subscriber, $invoice]), [
                'action' => $action, 'amount' => '75', 'amendment_reason' => 'تصحيح', 'correction_notes' => 'سبب الحذف',
            ])->assertSessionHasErrors('action');
        }
        foreach (['edit_metadata', 'refund', 'delete'] as $action) {
            if (in_array($action, $paymentActions, true)) {
                continue;
            }
            $this->post(route('subscribers.transactions.actions.store', [$subscriber, $payment]), [
                'action' => $action, 'amendment_reason' => 'تصحيح', 'correction_notes' => 'سبب الحذف',
            ])->assertSessionHasErrors('action');
        }
        $this->assertDatabaseCount('subscriber_transactions', 2);
        $this->assertDatabaseCount('transaction_deletions', 0);
        $this->assertDatabaseCount('transaction_amendments', 0);
        $this->assertSame(30.0, $subscriber->balance());
    }

    public function test_cancellation_and_permanent_deletion_do_not_grant_each_other(): void
    {
        $actor = User::factory()->collector()->create();
        $subscriber = Subscriber::factory()->create(['branch_id' => $actor->branch_id]);
        $invoice = SubscriberTransaction::recordCharge($subscriber, $actor, ChargeType::Penalty, '50', 'غرامة');
        SubscriberTransaction::recordPayment($subscriber, $actor, ['amount' => '20', 'currency' => 'ILS', 'payment_method' => 'cash']);
        $actor->permissions()->sync(Permission::idsFor([PermissionKey::ViewSubscribers, PermissionKey::ForceDeleteTransactions]));
        $this->actingAs($actor)->delete(route('subscribers.transactions.destroy', [$subscriber, $invoice]), [
            'correction_reason' => 'wrong_amount', 'correction_notes' => 'تصحيح',
        ])->assertForbidden();
        $actor->permissions()->sync(Permission::idsFor([PermissionKey::ViewSubscribers, PermissionKey::DeleteTransactions]));
        $actor->unsetRelation('permissions');
        $this->post(route('subscribers.transactions.actions.store', [$subscriber, $invoice]), ['action' => 'cancel'])->assertSessionHasNoErrors();
        $this->assertTrue($invoice->refresh()->isCancelled());
        $this->assertDatabaseCount('transaction_deletions', 0);
    }

    public function test_recording_readings_does_not_allow_correcting_them_and_correction_can_be_granted_separately(): void
    {
        $this->travelTo('2026-09-24 10:00:00');
        $actor = User::factory()->dataEntry()->create();
        $actor->permissions()->sync(Permission::idsFor([PermissionKey::ViewSubscribers, PermissionKey::RecordMeterReadings]));
        $subscriber = Subscriber::factory()->create(['branch_id' => $actor->branch_id, 'initial_reading' => 1200]);
        $reading = MeterReading::factory()->for($subscriber)->create(['week_start' => '2026-09-18', 'previous_reading' => 1200, 'current_reading' => '1205']);
        $this->actingAs($actor)->put(route('meter-readings.update', $reading), ['current_reading' => '1210'])->assertForbidden();
        $this->assertSame(1205.0, $reading->refresh()->current_reading);
        $actor->permissions()->sync(Permission::idsFor([PermissionKey::ViewSubscribers, PermissionKey::CorrectMeterReadings]));
        $actor->unsetRelation('permissions');
        $this->put(route('meter-readings.update', $reading), ['current_reading' => '1210'])->assertSessionHasNoErrors();
        $this->assertSame(1210.0, $reading->refresh()->current_reading);
    }

    public function test_bulk_changes_need_both_bulk_and_field_permissions(): void
    {
        $actor = User::factory()->dataEntry()->create();
        $actor->permissions()->sync(Permission::idsFor([PermissionKey::UpdateSubscribers]));
        $subscriber = Subscriber::factory()->create(['branch_id' => $actor->branch_id]);
        $this->actingAs($actor)->post(route('subscribers.bulk-changes.store'), [
            'field' => 'status', 'value' => 'inactive', 'subscriber_ids' => [$subscriber->id],
        ])->assertForbidden();
        $this->assertTrue($actor->can('update', $subscriber));
        $actor->permissions()->sync(Permission::idsFor([PermissionKey::BulkUpdateSubscribers]));
        $actor->unsetRelation('permissions');
        $this->assertFalse($actor->can('bulkUpdate', [Subscriber::class, 'status']));
        $actor->permissions()->sync(Permission::idsFor([PermissionKey::BulkUpdateSubscribers, PermissionKey::UpdateSubscribers]));
        $actor->unsetRelation('permissions');
        $this->assertTrue($actor->can('bulkUpdate', [Subscriber::class, 'status']));
        $this->assertFalse($actor->can('bulkUpdate', [Subscriber::class, 'minimum_charge']));
    }

    public function test_viewing_branch_closings_does_not_allow_preparing_or_exporting_them(): void
    {
        $actor = User::factory()->collector()->create();
        $actor->permissions()->sync(Permission::idsFor([PermissionKey::ViewOwnClosings]));
        $closing = Closing::factory()->create(['branch_id' => $actor->branch_id]);
        $this->actingAs($actor)->get(route('closings.index'))->assertOk()->assertInertia(fn ($page) => $page->where('canExport', false));
        $this->get(route('reports.index'))->assertOk()->assertInertia(fn ($page) => $page->where('canExport', false));
        $this->put(route('closings.count', $closing), [])->assertForbidden();
        $this->get(route('closings.export'))->assertForbidden();
        $this->get(route('reports.export'))->assertForbidden();
        $actor->permissions()->syncWithoutDetaching(Permission::idsFor([PermissionKey::ExportFinancialReports]));
        $actor->unsetRelation('permissions');
        $this->get(route('reports.export'))->assertOk();
        $foreign = Branch::factory()->create();
        $foreignSubscriber = Subscriber::factory()->create(['branch_id' => $foreign->id]);
        SubscriberTransaction::recordCharge($foreignSubscriber, $actor, ChargeType::Penalty, '50', 'Foreign confidential charge');
        $response = $this->get(route('reports.export', ['branch' => $foreign->id]))->assertOk();
        $this->assertStringNotContainsString('Foreign confidential charge', $response->streamedContent());
    }

    public function test_malformed_permission_payload_cannot_silently_clear_grants(): void
    {
        $admin = User::factory()->superAdmin()->create();
        $target = User::factory()->dataEntry()->create();
        $before = $target->permissions()->pluck('permissions.id')->all();
        $this->actingAs($admin)->put(route('settings.permissions.update'), ['permissions' => [$target->id => false]])
            ->assertSessionHasErrors('permissions.'.$target->id);
        $this->assertSame($before, $target->fresh()->permissions()->pluck('permissions.id')->all());
    }
}
