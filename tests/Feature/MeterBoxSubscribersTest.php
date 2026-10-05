<?php

namespace Tests\Feature;

use App\Enums\ChargeType;
use App\Enums\PermissionKey;
use App\Enums\SubscriberStatus;
use App\Models\CircuitBreaker;
use App\Models\MeterBox;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MeterBoxSubscribersTest extends TestCase
{
    use RefreshDatabase;

    public function test_meter_box_totals_use_only_visible_subscribers_and_do_not_offset_debt_with_other_accounts_credit(): void
    {
        $actor = User::factory()->branchAdmin()->create();
        $box = MeterBox::factory()->create(['branch_id' => $actor->branch_id, 'box_number' => 'BOX-001']);
        MeterBox::factory()->create(['branch_id' => $actor->branch_id, 'box_number' => 'BOX-002']);
        $debtor = Subscriber::factory()->create(['branch_id' => $actor->branch_id, 'meter_box_id' => $box->id]);
        $creditor = Subscriber::factory()->create(['branch_id' => $actor->branch_id, 'meter_box_id' => $box->id, 'status' => SubscriberStatus::Disconnected]);
        SubscriberTransaction::recordCharge($debtor, $actor, ChargeType::Penalty, '100', 'Charge');
        SubscriberTransaction::recordPayment($debtor, $actor, ['amount' => '20', 'currency' => 'ILS', 'payment_method' => 'cash']);
        SubscriberTransaction::recordPayment($creditor, $actor, ['amount' => '50', 'currency' => 'ILS', 'payment_method' => 'cash']);
        Subscriber::factory()->create(['meter_box_id' => $box->id]);

        $this->actingAs($actor)->get(route('meter-boxes.index'))->assertInertia(fn ($page) => $page
            ->where('summary', ['total' => 2, 'subscribers' => 2, 'active' => 1, 'empty' => 1, 'debt' => '80.00'])
            ->where('meterBoxes.total', 2)
            ->where('meterBoxes.data.0.subscribersCount', 2)
            ->where('meterBoxes.data.0.activeSubscribersCount', 1)
            ->where('meterBoxes.data.0.debt', '80.00')
            ->missing('meterBoxes.data.0.subscribers'));

        $this->get(route('meter-boxes.index', ['search' => 'BOX-002']))->assertInertia(fn ($page) => $page
            ->where('summary', ['total' => 1, 'subscribers' => 0, 'active' => 0, 'empty' => 1, 'debt' => '0.00']));
    }

    public function test_expanded_rows_show_subscription_identity_latest_reading_and_financial_balance_for_that_box_only(): void
    {
        $actor = User::factory()->branchAdmin()->create();
        $box = MeterBox::factory()->create(['branch_id' => $actor->branch_id]);
        $subscriber = Subscriber::factory()->create([
            'branch_id' => $actor->branch_id, 'meter_box_id' => $box->id, 'full_name' => 'Personal name',
            'subscription_name' => 'Subscription name', 'initial_reading' => 0,
        ]);
        Subscriber::factory()->create(['branch_id' => $actor->branch_id]);
        SubscriberTransaction::recordPayment($subscriber, $actor, ['amount' => '50', 'currency' => 'ILS', 'payment_method' => 'cash']);

        $this->actingAs($actor)->getJson(route('meter-boxes.subscribers.index', $box))->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.display_name', 'Subscription name')
            ->assertJsonPath('data.0.account_number', $subscriber->account_number)
            ->assertJsonPath('data.0.outstandingBalance', '-50.00')
            ->assertJsonPath('data.0.lastReading', 0)
            ->assertJsonPath('data.0.statementUrl', route('subscribers.statement', $subscriber, absolute: false));
    }

    public function test_subscriber_rows_are_paginated_instead_of_loading_every_account(): void
    {
        $actor = User::factory()->branchAdmin()->create();
        $box = MeterBox::factory()->create(['branch_id' => $actor->branch_id]);
        $breaker = CircuitBreaker::factory()->create();
        Subscriber::factory()->recycle($breaker)->count(16)->create(['branch_id' => $actor->branch_id, 'meter_box_id' => $box->id]);

        $this->actingAs($actor)->getJson(route('meter-boxes.subscribers.index', $box))
            ->assertOk()->assertJsonCount(15, 'data')->assertJsonPath('total', 16)->assertJsonPath('last_page', 2);
        $this->getJson(route('meter-boxes.subscribers.index', [$box, 'page' => 2]))
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('current_page', 2);
    }

    public function test_viewing_meter_boxes_alone_does_not_reveal_subscriber_details_or_debt(): void
    {
        $actor = User::factory()->collector()->withPermissions([PermissionKey::ViewMeterBoxes])->create();
        $box = MeterBox::factory()->create(['branch_id' => $actor->branch_id]);
        Subscriber::factory()->create(['branch_id' => $actor->branch_id, 'meter_box_id' => $box->id]);

        $this->actingAs($actor)->get(route('meter-boxes.index'))->assertInertia(fn ($page) => $page
            ->where('canViewSubscribers', false)->where('summary.debt', null)->where('meterBoxes.data.0.debt', null));
        $this->getJson(route('meter-boxes.subscribers.index', $box))->assertForbidden();
    }

    public function test_subscriber_access_alone_does_not_allow_opening_meter_box_rows(): void
    {
        $actor = User::factory()->collector()->withPermissions([PermissionKey::ViewSubscribers])->create();
        $box = MeterBox::factory()->create(['branch_id' => $actor->branch_id]);

        $this->actingAs($actor)->getJson(route('meter-boxes.subscribers.index', $box))->assertForbidden();
    }

    public function test_another_branchs_meter_box_cannot_be_opened(): void
    {
        $actor = User::factory()->branchAdmin()->create();
        $box = MeterBox::factory()->create();

        $this->actingAs($actor)->getJson(route('meter-boxes.subscribers.index', $box))->assertNotFound();
    }

    public function test_empty_meter_boxes_and_missing_authentication_have_clear_responses(): void
    {
        $actor = User::factory()->superAdmin()->create();
        $box = MeterBox::factory()->create();
        $this->getJson(route('meter-boxes.subscribers.index', $box))->assertUnauthorized();

        $this->actingAs($actor)->getJson(route('meter-boxes.subscribers.index', $box))
            ->assertOk()->assertJsonPath('total', 0)->assertJsonCount(0, 'data');
    }
}
