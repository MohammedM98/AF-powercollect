<?php

namespace Tests\Feature;

use App\Enums\ChargeType;
use App\Enums\PermissionKey;
use App\Enums\SubscriptionStatus;
use App\Models\CircuitBreaker;
use App\Models\MeterBox;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MeterBoxSubscriptionsTest extends TestCase
{
    use RefreshDatabase;

    public function test_meter_box_totals_use_only_visible_subscriptions_and_do_not_offset_debt_with_other_accounts_credit(): void
    {
        $actor = User::factory()->branchAdmin()->create();
        $box = MeterBox::factory()->create(['branch_id' => $actor->branch_id, 'box_number' => 'BOX-001']);
        MeterBox::factory()->create(['branch_id' => $actor->branch_id, 'box_number' => 'BOX-002']);
        $debtor = Subscription::factory()->create(['branch_id' => $actor->branch_id, 'meter_box_id' => $box->id]);
        $creditor = Subscription::factory()->create(['branch_id' => $actor->branch_id, 'meter_box_id' => $box->id, 'status' => SubscriptionStatus::Disconnected]);
        SubscriptionTransaction::recordCharge($debtor, $actor, ChargeType::Penalty, '100', 'Charge');
        SubscriptionTransaction::recordPayment($debtor, $actor, ['amount' => '20', 'currency' => 'ILS', 'payment_method' => 'cash']);
        SubscriptionTransaction::recordPayment($creditor, $actor, ['amount' => '50', 'currency' => 'ILS', 'payment_method' => 'cash']);
        Subscription::factory()->create(['meter_box_id' => $box->id]);

        $this->actingAs($actor)->get(route('meter-boxes.index'))->assertInertia(fn ($page) => $page
            ->where('summary', ['total' => 2, 'subscriptions' => 2, 'active' => 1, 'empty' => 1, 'debt' => '80.00'])
            ->where('meterBoxes.total', 2)
            ->where('meterBoxes.data.0.subscriptionsCount', 2)
            ->where('meterBoxes.data.0.activeSubscriptionsCount', 1)
            ->where('meterBoxes.data.0.debt', '80.00')
            ->missing('meterBoxes.data.0.subscriptions'));

        $this->get(route('meter-boxes.index', ['search' => 'BOX-002']))->assertInertia(fn ($page) => $page
            ->where('summary', ['total' => 1, 'subscriptions' => 0, 'active' => 0, 'empty' => 1, 'debt' => '0.00']));
    }

    public function test_expanded_rows_show_subscription_identity_latest_reading_and_financial_balance_for_that_box_only(): void
    {
        $actor = User::factory()->branchAdmin()->create();
        $box = MeterBox::factory()->create(['branch_id' => $actor->branch_id]);
        $subscription = Subscription::factory()->create([
            'branch_id' => $actor->branch_id, 'meter_box_id' => $box->id, 'full_name' => 'Personal name',
            'subscription_name' => 'Subscription name', 'initial_reading' => 0,
        ]);
        Subscription::factory()->create(['branch_id' => $actor->branch_id]);
        SubscriptionTransaction::recordPayment($subscription, $actor, ['amount' => '50', 'currency' => 'ILS', 'payment_method' => 'cash']);

        $this->actingAs($actor)->getJson(route('meter-boxes.subscriptions.index', $box))->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.display_name', 'Subscription name')
            ->assertJsonPath('data.0.account_number', $subscription->account_number)
            ->assertJsonPath('data.0.outstandingBalance', '-50.00')
            ->assertJsonPath('data.0.lastReading', 0)
            ->assertJsonPath('data.0.statementUrl', route('subscriptions.statement', $subscription, absolute: false));
    }

    public function test_subscription_rows_are_paginated_instead_of_loading_every_account(): void
    {
        $actor = User::factory()->branchAdmin()->create();
        $box = MeterBox::factory()->create(['branch_id' => $actor->branch_id]);
        $breaker = CircuitBreaker::factory()->create();
        Subscription::factory()->recycle($breaker)->count(16)->create(['branch_id' => $actor->branch_id, 'meter_box_id' => $box->id]);

        $this->actingAs($actor)->getJson(route('meter-boxes.subscriptions.index', $box))
            ->assertOk()->assertJsonCount(15, 'data')->assertJsonPath('total', 16)->assertJsonPath('last_page', 2);
        $this->getJson(route('meter-boxes.subscriptions.index', [$box, 'page' => 2]))
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('current_page', 2);
    }

    public function test_viewing_meter_boxes_alone_does_not_reveal_subscription_details_or_debt(): void
    {
        $actor = User::factory()->collector()->withPermissions([PermissionKey::ViewMeterBoxes])->create();
        $box = MeterBox::factory()->create(['branch_id' => $actor->branch_id]);
        Subscription::factory()->create(['branch_id' => $actor->branch_id, 'meter_box_id' => $box->id]);

        $this->actingAs($actor)->get(route('meter-boxes.index'))->assertInertia(fn ($page) => $page
            ->where('canViewSubscriptions', false)->where('summary.debt', null)->where('meterBoxes.data.0.debt', null));
        $this->getJson(route('meter-boxes.subscriptions.index', $box))->assertForbidden();
    }

    public function test_subscription_access_alone_does_not_allow_opening_meter_box_rows(): void
    {
        $actor = User::factory()->collector()->withPermissions([PermissionKey::ViewSubscriptions])->create();
        $box = MeterBox::factory()->create(['branch_id' => $actor->branch_id]);

        $this->actingAs($actor)->getJson(route('meter-boxes.subscriptions.index', $box))->assertForbidden();
    }

    public function test_another_branchs_meter_box_cannot_be_opened(): void
    {
        $actor = User::factory()->branchAdmin()->create();
        $box = MeterBox::factory()->create();

        $this->actingAs($actor)->getJson(route('meter-boxes.subscriptions.index', $box))->assertNotFound();
    }

    public function test_empty_meter_boxes_and_missing_authentication_have_clear_responses(): void
    {
        $actor = User::factory()->superAdmin()->create();
        $box = MeterBox::factory()->create();
        $this->getJson(route('meter-boxes.subscriptions.index', $box))->assertUnauthorized();

        $this->actingAs($actor)->getJson(route('meter-boxes.subscriptions.index', $box))
            ->assertOk()->assertJsonPath('total', 0)->assertJsonCount(0, 'data');
    }
}
