<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\MeterReading;
use App\Models\MobileAccessToken;
use App\Models\Permission;
use App\Models\ReadingEntrySetting;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
