<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\CircuitBreaker;
use App\Models\MeterReading;
use App\Models\MobileAccessToken;
use App\Models\Permission;
use App\Models\ReadingEntrySetting;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

class MobileApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_mobile_login_issues_a_hashed_token_and_logout_revokes_it(): void
    {
        $user = User::factory()->branchAdmin()->create();

        $this->postJson(route('mobile.login'), ['username' => $user->username, 'password' => 'wrong'])
            ->assertUnprocessable();

        $token = $this->postJson(route('mobile.login'), ['username' => $user->username, 'password' => 'password'])
            ->assertOk()
            ->assertJsonPath('user.id', $user->id)
            ->json('token');

        $this->assertDatabaseHas('mobile_access_tokens', ['user_id' => $user->id, 'token_hash' => hash('sha256', $token)]);
        $this->assertDatabaseMissing('mobile_access_tokens', ['token_hash' => $token]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(route('mobile.me'))->assertOk()->assertJsonPath('user.username', $user->username);
        $this->postJson(route('mobile.logout'))->assertOk();
        $this->getJson(route('mobile.me'))->assertUnauthorized();
    }

    public function test_weekly_reading_view_requires_permission_and_does_not_grant_write_access(): void
    {
        $this->getJson(route('mobile.readings.index'))->assertUnauthorized();
        $collector = User::factory()->collector()->create();
        $collector->permissions()->sync(Permission::idsFor([PermissionKey::RecordCollections]));
        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($collector));
        $this->getJson(route('mobile.me'))->assertJsonPath('user.can_view_readings', false);
        $this->getJson(route('mobile.readings.index'))->assertForbidden();

        $collector->permissions()->sync(Permission::idsFor([PermissionKey::ViewMeterReadings]));
        $this->getJson(route('mobile.me'))
            ->assertJsonPath('user.can_view_readings', true)
            ->assertJsonPath('user.can_record_readings', false)
            ->assertJsonPath('user.can_record_collections', false);
        $this->getJson(route('mobile.readings.index'))->assertOk();
        $this->postJson(route('mobile.readings.store'), [])->assertForbidden();
        $this->postJson(route('mobile.collections.store'), [])->assertForbidden();
        $this->getJson(route('mobile.subscribers.index'))->assertForbidden();

        $collector->permissions()->detach();
        $this->getJson(route('mobile.readings.index'))->assertForbidden();
    }

    public function test_weekly_readings_show_selected_week_and_missing_readings_only_in_the_visible_branch(): void
    {
        $this->travelTo('2026-09-24 10:00:00');
        $user = User::factory()->collector()->create();
        $user->permissions()->sync(Permission::idsFor([PermissionKey::ViewMeterReadings]));
        $week = MeterReading::latestEndedWeekStart();
        $olderWeek = $week->copy()->subWeek();
        $subscriber = Subscriber::factory()->create(['branch_id' => $user->branch_id, 'full_name' => 'Alpha', 'account_number' => 'WEEK-42']);
        $missing = Subscriber::factory()->create(['branch_id' => $user->branch_id, 'full_name' => 'Beta', 'initial_reading' => 40]);
        $other = Subscriber::factory()->create(['full_name' => 'Hidden', 'account_number' => 'HIDDEN-99']);
        MeterReading::factory()->approved()->create([
            'subscriber_id' => $subscriber->id, 'week_start' => $olderWeek,
            'previous_reading' => 100, 'current_reading' => 120, 'consumption' => 20,
        ]);
        MeterReading::factory()->create([
            'subscriber_id' => $subscriber->id, 'week_start' => $week,
            'previous_reading' => 120, 'current_reading' => 150, 'consumption' => 30, 'amount_due' => '25.00',
        ]);
        MeterReading::factory()->create(['subscriber_id' => $other->id, 'week_start' => $week]);
        MeterReading::factory()->create(['subscriber_id' => $missing->id, 'week_start' => $week->copy()->addWeek(), 'current_reading' => 99]);

        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($user));
        $this->getJson(route('mobile.readings.index'))
            ->assertJsonPath('week_start', $week->toDateString())
            ->assertJsonPath('total', 2)
            ->assertJsonPath('data.0.id', $subscriber->id)
            ->assertJsonPath('data.0.previous_reading', 120)
            ->assertJsonPath('data.0.current_reading', 150)
            ->assertJsonPath('data.0.consumption', 30)
            ->assertJsonPath('data.0.amount_due', '25.00')
            ->assertJsonPath('data.0.status', 'pending')
            ->assertJsonPath('data.1.current_reading', null)
            ->assertJsonPath('data.1.previous_reading', 40)
            ->assertJsonPath('data.1.status', null);
        $this->getJson(route('mobile.readings.index', ['week' => $olderWeek->toDateString(), 'search' => 'WEEK-42']))
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.current_reading', 120)
            ->assertJsonPath('data.0.status', 'approved');
        $this->getJson(route('mobile.readings.index', ['search' => 'HIDDEN-99']))->assertJsonPath('total', 0);
    }

    public function test_weekly_reading_list_is_paginated_and_rejects_invalid_filters(): void
    {
        $user = User::factory()->collector()->create();
        $user->permissions()->sync(Permission::idsFor([PermissionKey::ViewMeterReadings]));
        Subscriber::factory()->recycle(CircuitBreaker::factory()->create())->count(26)->create(['branch_id' => $user->branch_id]);
        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($user));

        $this->getJson(route('mobile.readings.index'))->assertJsonCount(25, 'data')->assertJsonPath('last_page', 2);
        $this->getJson(route('mobile.readings.index', ['page' => 2]))->assertJsonCount(1, 'data')->assertJsonPath('total', 26);
        $this->getJson(route('mobile.readings.index', ['week' => 'invalid', 'page' => 0, 'search' => str_repeat('a', 101)]))
            ->assertUnprocessable()->assertJsonValidationErrors(['week', 'page', 'search']);
    }

    public function test_inactive_user_and_expired_token_cannot_access_mobile(): void
    {
        $user = User::factory()->create(['is_active' => false]);

        $this->postJson(route('mobile.login'), ['username' => $user->username, 'password' => 'password'])
            ->assertUnprocessable();

        $active = User::factory()->create();
        $token = MobileAccessToken::issue($active);
        MobileAccessToken::query()->where('user_id', $active->id)->update(['expires_at' => now()->subSecond()]);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson(route('mobile.me'))->assertUnauthorized();
    }

    public function test_mobile_roster_is_scoped_to_the_staff_branch(): void
    {
        $branch = Branch::factory()->create();
        $otherBranch = Branch::factory()->create();
        $user = User::factory()->dataEntry()->create(['branch_id' => $branch->id]);
        $own = Subscriber::factory()->create(['branch_id' => $branch->id, 'full_name' => 'Own Subscriber', 'initial_reading' => 1200]);
        Subscriber::factory()->create(['branch_id' => $otherBranch->id, 'full_name' => 'Other Subscriber']);

        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($user))
            ->getJson(route('mobile.subscribers.index'))
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.id', $own->id)
            ->assertJsonPath('data.0.previous_reading', 1200);
    }

    public function test_collector_cannot_download_the_offline_reading_roster(): void
    {
        $collector = User::factory()->collector()->create();
        $collector->permissions()->sync(Permission::idsFor([PermissionKey::RecordCollections]));

        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($collector))
            ->getJson(route('mobile.subscribers.index'))
            ->assertForbidden();
    }

    public function test_mobile_reading_is_pending_and_retries_do_not_duplicate_it(): void
    {
        $this->travelTo('2026-09-24 10:00:00');
        ReadingEntrySetting::factory()->forcedOpen()->create();
        $user = User::factory()->dataEntry()->create();
        $subscriber = Subscriber::factory()->create(['branch_id' => $user->branch_id, 'initial_reading' => 1200]);
        $operationId = Str::uuid()->toString();
        $payload = [
            'mobile_operation_id' => $operationId,
            'subscriber_id' => $subscriber->id,
            'week_start' => MeterReading::latestEndedWeekStart()->toDateString(),
            'current_reading' => 1250,
        ];

        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($user));
        $created = $this->postJson(route('mobile.readings.store'), $payload)
            ->assertCreated()
            ->assertJsonPath('status', 'pending')
            ->json('id');
        $this->postJson(route('mobile.readings.store'), $payload)
            ->assertCreated()
            ->assertJsonPath('id', $created);
        $this->assertDatabaseCount('meter_readings', 1);

        $otherSubscriber = Subscriber::factory()->create(['branch_id' => $user->branch_id, 'initial_reading' => 1200]);
        $this->postJson(route('mobile.readings.store'), [
            ...$payload,
            'mobile_operation_id' => Str::uuid()->toString(),
            'subscriber_id' => $otherSubscriber->id,
            'current_reading' => 1100,
        ])->assertUnprocessable()->assertJsonValidationErrors('current_reading');
    }

    public function test_mobile_entry_returns_403_outside_the_saved_hours(): void
    {
        config(['app.business_timezone' => 'Asia/Gaza']);
        $this->travelTo(now()->parse('2026-09-24 14:01:00', 'UTC'));
        ReadingEntrySetting::factory()->create(['opens_at' => '08:30:00', 'closes_at' => '17:00:00']);
        $user = User::factory()->dataEntry()->create();
        $subscriber = Subscriber::factory()->create(['branch_id' => $user->branch_id]);

        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($user));
        $this->getJson(route('mobile.subscribers.index'))->assertOk()->assertJsonPath('can_record_readings_now', false);
        $this->postJson(route('mobile.readings.store'), [
            'mobile_operation_id' => Str::uuid()->toString(),
            'subscriber_id' => $subscriber->id,
            'week_start' => '2026-09-18',
            'current_reading' => 1250,
        ])->assertForbidden();

        $this->assertDatabaseCount('meter_readings', 0);
    }

    public function test_staff_cannot_record_a_reading_for_another_branch(): void
    {
        ReadingEntrySetting::factory()->forcedOpen()->create();
        $user = User::factory()->dataEntry()->create();
        $otherSubscriber = Subscriber::factory()->create();

        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($user))
            ->postJson(route('mobile.readings.store'), [
                'mobile_operation_id' => Str::uuid()->toString(),
                'subscriber_id' => $otherSubscriber->id,
                'week_start' => MeterReading::latestEndedWeekStart()->toDateString(),
                'current_reading' => 100,
            ])->assertUnprocessable()->assertJsonValidationErrors('subscriber_id');
        $this->assertDatabaseCount('meter_readings', 0);
    }

    public function test_mobile_payment_requires_collector_confirmation_and_records_directly_once(): void
    {
        $collector = User::factory()->collector()->create();
        $collector->permissions()->sync(Permission::idsFor([PermissionKey::RecordCollections]));
        $subscriber = Subscriber::factory()->create(['branch_id' => $collector->branch_id]);
        $startingBalance = $subscriber->balance();
        $payload = [
            'mobile_operation_id' => Str::uuid()->toString(),
            'subscriber_id' => $subscriber->id,
            'amount' => '100.00',
            'currency' => 'ILS',
            'payment_method' => 'cash',
        ];

        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($collector));
        $this->postJson(route('mobile.collections.store'), $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('collector_confirmed');
        $this->postJson(route('mobile.collections.store'), [
            ...$payload,
            'collector_confirmed' => false,
        ])->assertUnprocessable()->assertJsonValidationErrors('collector_confirmed');
        $this->assertSame($startingBalance, $subscriber->fresh()->balance());

        $payload['collector_confirmed'] = true;
        $created = $this->postJson(route('mobile.collections.store'), $payload)
            ->assertCreated()
            ->assertJsonPath('status', 'recorded')
            ->assertJsonPath('amount', '100.00')
            ->assertJsonStructure(['voucher_number'])
            ->json('id');
        $this->postJson(route('mobile.collections.store'), $payload)
            ->assertCreated()->assertJsonPath('id', $created);

        $this->assertDatabaseHas('subscriber_transactions', [
            'id' => $created,
            'mobile_operation_id' => $payload['mobile_operation_id'],
            'type' => SubscriberTransaction::TYPE_PAYMENT,
            'amount' => '-100.00',
        ]);
        $this->assertSame(1, SubscriberTransaction::query()->where('mobile_operation_id', $payload['mobile_operation_id'])->count());
        $this->assertSame($startingBalance - 100, $subscriber->fresh()->balance());
        $this->getJson(route('mobile.collections.index'))
            ->assertOk()->assertJsonPath('data.0.id', $created)
            ->assertJsonPath('data.0.status', 'recorded');
    }

    public function test_mobile_bank_transfers_keep_both_source_and_destination_banks(): void
    {
        $collector = User::factory()->collector()->create();
        $collector->permissions()->sync(Permission::idsFor([PermissionKey::RecordCollections]));
        $subscriber = Subscriber::factory()->create(['branch_id' => $collector->branch_id]);

        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($collector))
            ->postJson(route('mobile.collections.store'), [
                'mobile_operation_id' => Str::uuid()->toString(),
                'subscriber_id' => $subscriber->id,
                'amount' => '100',
                'currency' => 'ILS',
                'payment_method' => 'bank_transfer',
                'bank_name' => 'محفظة بالباي',
                'sender_bank_name' => 'البنك الوطني الإسلامي',
                'sender_name' => 'Ahmad',
                'reference_number' => 'TR-MOBILE-1',
                'collector_confirmed' => true,
            ])->assertCreated();

        $this->assertDatabaseHas('subscriber_transactions', [
            'subscriber_id' => $subscriber->id,
            'bank_name' => 'محفظة بالباي',
            'sender_bank_name' => 'البنك الوطني الإسلامي',
            'amount' => '-100.00',
        ]);
    }

    public function test_mobile_payments_in_other_currencies_count_in_shekels_and_offer_the_website_banks(): void
    {
        $collector = User::factory()->collector()->create();
        $collector->permissions()->sync(Permission::idsFor([PermissionKey::RecordCollections]));
        $subscriber = Subscriber::factory()->create(['branch_id' => $collector->branch_id]);
        $startingBalance = $subscriber->balance();
        $payment = [
            'subscriber_id' => $subscriber->id,
            'amount' => '20',
            'currency' => 'USD',
            'payment_method' => 'cash',
            'collector_confirmed' => true,
        ];

        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($collector));
        $this->getJson(route('mobile.me'))
            ->assertJsonPath('user.transfer_banks', config('powercollect.transfer_banks'));
        $this->postJson(route('mobile.collections.store'), [...$payment, 'mobile_operation_id' => Str::uuid()->toString()])
            ->assertUnprocessable()->assertJsonValidationErrors('exchange_rate');
        $this->postJson(route('mobile.collections.store'), [
            ...$payment,
            'mobile_operation_id' => Str::uuid()->toString(),
            'exchange_rate' => '3.7',
        ])->assertCreated()
            ->assertJsonPath('amount', '20.00')
            ->assertJsonPath('currency', 'USD')
            ->assertJsonPath('amount_in_shekels', '74.00');
        $this->postJson(route('mobile.collections.store'), [
            'mobile_operation_id' => Str::uuid()->toString(),
            'subscriber_id' => $subscriber->id,
            'amount' => '30',
            'currency' => 'ILS',
            'payment_method' => 'bank_transfer',
            'bank_name' => 'البنك الوطني الإسلامي',
            'sender_name' => 'Ahmad',
            'reference_number' => 'TR-30',
            'collector_confirmed' => true,
        ])->assertCreated()->assertJsonPath('bank_name', 'البنك الوطني الإسلامي');

        $this->assertSame($startingBalance - 104, $subscriber->fresh()->balance());
        $this->getJson(route('mobile.collections.index'))
            ->assertJsonPath('total', 104)
            ->assertJsonPath('cash_total', 74);
    }

    public function test_receipts_are_no_longer_read_or_stored_on_the_server(): void
    {
        $collector = User::factory()->collector()->create();
        $collector->permissions()->sync(Permission::idsFor([PermissionKey::RecordCollections]));

        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($collector))
            ->postJson('/api/mobile/payment-receipts/analyze')->assertNotFound();

        foreach (['payment_receipts', 'receipt_example_runs', 'receipt_examples', 'payment_providers'] as $table) {
            $this->assertFalse(Schema::hasTable($table), "{$table} should be dropped");
        }
    }

    public function test_mobile_payment_rejects_other_branch_and_other_collectors_retry(): void
    {
        $branch = Branch::factory()->create();
        $otherBranch = Branch::factory()->create();
        $collector = User::factory()->collector()->create(['branch_id' => $branch->id]);
        $collector->permissions()->sync(Permission::idsFor([PermissionKey::RecordCollections]));
        $otherSubscriber = Subscriber::factory()->create(['branch_id' => $otherBranch->id]);
        $payload = [
            'mobile_operation_id' => Str::uuid()->toString(),
            'collector_confirmed' => true,
            'subscriber_id' => $otherSubscriber->id,
            'amount' => '25.00',
            'currency' => 'ILS',
            'payment_method' => 'cash',
        ];

        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($collector))
            ->postJson(route('mobile.collections.store'), $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('subscriber_id');

        $subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
        $payload['subscriber_id'] = $subscriber->id;
        $this->postJson(route('mobile.collections.store'), $payload)->assertCreated();

        $otherCollector = User::factory()->collector()->create(['branch_id' => $branch->id]);
        $otherCollector->permissions()->sync(Permission::idsFor([PermissionKey::RecordCollections]));
        $this->withHeader('Authorization', 'Bearer '.MobileAccessToken::issue($otherCollector))
            ->postJson(route('mobile.collections.store'), $payload)->assertForbidden();

        $this->actingAs(User::factory()->branchAdmin()->create(['branch_id' => $branch->id]))
            ->get('/pending-collections')->assertNotFound();
    }
}
