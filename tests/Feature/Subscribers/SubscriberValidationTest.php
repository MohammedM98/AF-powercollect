<?php

namespace Tests\Feature\Subscribers;

use App\Enums\PermissionKey;
use App\Enums\SubscriberStatus;
use App\Models\CircuitBreaker;
use App\Models\Permission;
use App\Models\Subscriber;
use App\Models\Tariff;
use App\Models\TariffSegment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class SubscriberValidationTest extends TestCase
{
    use RefreshDatabase;

    public function test_national_id_is_required(): void
    {
        $payload = $this->validPayload();
        unset($payload['national_id']);

        $this->post(route('subscribers.store'), $payload)
            ->assertSessionHasErrors('national_id');

        $this->assertDatabaseCount('subscribers', 0);
    }

    #[TestWith(['12345678'])]
    #[TestWith(['1234567890'])]
    #[TestWith(['12345678A'])]
    public function test_national_id_must_be_exactly_nine_digits(string $nationalId): void
    {
        $payload = $this->validPayload();
        $payload['national_id'] = $nationalId;

        $this->post(route('subscribers.store'), $payload)
            ->assertSessionHasErrors('national_id');

        $this->assertDatabaseCount('subscribers', 0);
    }

    public function test_national_id_must_be_unique_across_subscribers(): void
    {
        $payload = $this->validPayload();
        $existing = Subscriber::factory()->create(['national_id' => $payload['national_id']]);

        $this->assertNotEquals(auth()->user()->branch_id, $existing->branch_id);

        $this->post(route('subscribers.store'), $payload)
            ->assertSessionHasErrors('national_id');

        $this->assertDatabaseCount('subscribers', 1);
    }

    public function test_national_id_uniqueness_ignores_the_current_subscriber_on_update(): void
    {
        $payload = $this->validPayload();
        $subscriber = Subscriber::factory()->create([
            'branch_id' => auth()->user()->branch_id,
            'national_id' => $payload['national_id'],
        ]);

        $this->put(route('subscribers.update', $subscriber), $payload)
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('subscribers.index'));

        $this->assertDatabaseHas('subscribers', [
            'id' => $subscriber->id,
            'national_id' => '012345678',
            'initial_reading' => 0,
        ]);
    }

    public function test_initial_reading_is_required(): void
    {
        $payload = $this->validPayload();
        unset($payload['initial_reading']);

        $this->post(route('subscribers.store'), $payload)
            ->assertSessionHasErrors('initial_reading');

        $this->assertDatabaseCount('subscribers', 0);
    }

    #[TestWith([-1])]
    #[TestWith([1.5])]
    #[TestWith(['invalid'])]
    public function test_initial_reading_must_be_a_non_negative_integer(int|float|string $reading): void
    {
        $payload = $this->validPayload();
        $payload['initial_reading'] = $reading;

        $this->post(route('subscribers.store'), $payload)
            ->assertSessionHasErrors('initial_reading');

        $this->assertDatabaseCount('subscribers', 0);
    }

    public function test_registration_preserves_leading_zeroes_and_accepts_zero_initial_reading(): void
    {
        $payload = $this->validPayload();

        $this->post(route('subscribers.store'), $payload)
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('subscribers.index'));

        $this->assertDatabaseHas('subscribers', [
            'national_id' => '012345678',
            'initial_reading' => 0,
            'branch_id' => auth()->user()->branch_id,
        ]);
    }

    public function test_update_rejects_another_subscribers_national_id(): void
    {
        $payload = $this->validPayload();
        Subscriber::factory()->create(['national_id' => $payload['national_id']]);
        $subscriber = Subscriber::factory()->create([
            'branch_id' => auth()->user()->branch_id,
            'national_id' => '987654321',
        ]);

        $this->put(route('subscribers.update', $subscriber), $payload)
            ->assertSessionHasErrors('national_id');

        $this->assertDatabaseHas('subscribers', [
            'id' => $subscriber->id,
            'national_id' => '987654321',
        ]);
    }

    public function test_update_requires_both_registration_fields(): void
    {
        $payload = $this->validPayload();
        $subscriber = Subscriber::factory()->create(['branch_id' => auth()->user()->branch_id]);
        unset($payload['national_id'], $payload['initial_reading']);

        $this->put(route('subscribers.update', $subscriber), $payload)
            ->assertSessionHasErrors(['national_id', 'initial_reading']);

        $this->assertDatabaseHas('subscribers', [
            'id' => $subscriber->id,
            'national_id' => $subscriber->national_id,
            'initial_reading' => $subscriber->initial_reading,
        ]);
    }

    private function validPayload(): array
    {
        $this->actingAs(User::factory()->dataEntry()->create());

        return [
            'full_name' => 'Registration Customer',
            'national_id' => '012345678',
            'phone' => '0590000000',
            'address' => 'Some street',
            'tariff_id' => Tariff::factory()->residential()->create()->id,
            'status' => SubscriberStatus::Active->value,
            'minimum_charge' => 10,
            'initial_reading' => 0,
            'notes' => 'Registration notes',
        ];
    }

    public function test_registering_a_subscriber_with_a_circuit_breaker_stores_it(): void
    {
        $payload = $this->validPayload();
        $circuitBreaker = CircuitBreaker::factory()->create(['ampere' => 4, 'minimum_payment' => 20]);
        $payload['circuit_breaker_id'] = $circuitBreaker->id;

        $this->post(route('subscribers.store'), $payload)
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('subscribers.index'));

        $this->assertDatabaseHas('subscribers', [
            'national_id' => $payload['national_id'],
            'circuit_breaker_id' => $circuitBreaker->id,
        ]);
    }

    public function test_registering_a_subscriber_with_a_segment_of_its_tariff_stores_it(): void
    {
        $payload = $this->validPayload();
        $segment = TariffSegment::factory()->create(['tariff_id' => $payload['tariff_id'], 'name' => 'مساجد']);
        $payload['tariff_segment_id'] = $segment->id;

        $this->post(route('subscribers.store'), $payload)
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('subscribers.index'));

        $this->assertDatabaseHas('subscribers', [
            'national_id' => $payload['national_id'],
            'tariff_segment_id' => $segment->id,
        ]);
    }

    public function test_subscriber_segment_must_belong_to_the_chosen_tariff(): void
    {
        $payload = $this->validPayload();
        $payload['tariff_segment_id'] = TariffSegment::factory()->create(['tariff_id' => Tariff::factory()->commercial()])->id;

        $this->post(route('subscribers.store'), $payload)->assertSessionHasErrors('tariff_segment_id');
        $this->assertDatabaseCount('subscribers', 0);
    }

    public function test_subscriber_circuit_breaker_must_exist(): void
    {
        $payload = $this->validPayload();
        $payload['circuit_breaker_id'] = 999999;

        $this->post(route('subscribers.store'), $payload)->assertSessionHasErrors('circuit_breaker_id');
        $this->assertDatabaseCount('subscribers', 0);
    }

    public function test_address_and_notes_can_be_omitted(): void
    {
        $payload = $this->validPayload();
        unset($payload['address'], $payload['notes']);

        $this->post(route('subscribers.store'), $payload)
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('subscribers.index'));

        $this->assertDatabaseHas('subscribers', [
            'national_id' => $payload['national_id'],
            'address' => null,
            'notes' => null,
        ]);
    }

    #[TestWith(['0591234567'])]
    #[TestWith(['0561234567'])]
    public function test_registration_accepts_supported_phone_prefixes_and_blank_optional_fields(string $phone): void
    {
        $payload = $this->validPayload();
        $payload['phone'] = $phone;
        $payload['address'] = '';
        $payload['notes'] = '';

        $this->post(route('subscribers.store'), $payload)->assertSessionHasNoErrors()
            ->assertRedirect(route('subscribers.index'));

        $this->assertDatabaseHas('subscribers', [
            'national_id' => $payload['national_id'],
            'phone' => $phone,
            'address' => null,
            'notes' => null,
        ]);
    }

    #[TestWith(['059123456'])]
    #[TestWith(['05912345678'])]
    #[TestWith(['0571234567'])]
    #[TestWith(['059123456A'])]
    public function test_registration_rejects_invalid_phone_numbers(string $phone): void
    {
        $payload = $this->validPayload();
        $payload['phone'] = $phone;

        $this->post(route('subscribers.store'), $payload)->assertSessionHasErrors('phone');

        $this->assertDatabaseCount('subscribers', 0);
    }

    public function test_update_rejects_invalid_phone_without_changing_the_subscriber(): void
    {
        $payload = $this->validPayload();
        $subscriber = Subscriber::factory()->create([
            'branch_id' => auth()->user()->branch_id,
            'phone' => '0591234567',
        ]);
        $payload['phone'] = '0571234567';

        $this->put(route('subscribers.update', $subscriber), $payload)->assertSessionHasErrors('phone');

        $this->assertDatabaseHas('subscribers', ['id' => $subscriber->id, 'phone' => '0591234567']);
    }

    public function test_update_accepts_valid_phone_and_clears_optional_fields(): void
    {
        $payload = $this->validPayload();
        $subscriber = Subscriber::factory()->create(['branch_id' => auth()->user()->branch_id]);
        $payload['phone'] = '0561234567';
        $payload['address'] = '';
        $payload['notes'] = '';

        $this->put(route('subscribers.update', $subscriber), $payload)->assertSessionHasNoErrors()
            ->assertRedirect(route('subscribers.index'));

        $this->assertDatabaseHas('subscribers', [
            'id' => $subscriber->id,
            'phone' => '0561234567',
            'address' => null,
            'notes' => null,
        ]);
    }

    public function test_minimum_charge_is_required(): void
    {
        $payload = $this->validPayload();
        unset($payload['minimum_charge']);

        $this->post(route('subscribers.store'), $payload)
            ->assertSessionHasErrors('minimum_charge');

        $this->assertDatabaseCount('subscribers', 0);
    }

    public function test_a_user_with_the_permission_can_override_minimum_charge_independent_of_the_circuit_breaker(): void
    {
        $payload = $this->validPayload();
        auth()->user()->permissions()->attach(
            Permission::create([
                'key' => PermissionKey::UpdateSubscriberMinimumCharge->value,
                'label' => PermissionKey::UpdateSubscriberMinimumCharge->label(),
            ]),
        );
        $circuitBreaker = CircuitBreaker::factory()->create(['ampere' => 4, 'minimum_payment' => 20]);
        $payload['circuit_breaker_id'] = $circuitBreaker->id;
        $payload['minimum_charge'] = 35;

        $this->post(route('subscribers.store'), $payload)
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('subscribers.index'));

        $this->assertDatabaseHas('subscribers', [
            'national_id' => $payload['national_id'],
            'circuit_breaker_id' => $circuitBreaker->id,
            'minimum_charge' => 35,
        ]);
    }

    public function test_a_branch_admin_can_override_minimum_charge_without_a_grant(): void
    {
        $payload = $this->validPayload();
        $this->actingAs(User::factory()->branchAdmin()->create());
        $circuitBreaker = CircuitBreaker::factory()->create(['ampere' => 4, 'minimum_payment' => 20]);
        $payload['circuit_breaker_id'] = $circuitBreaker->id;
        $payload['minimum_charge'] = 35;

        $this->post(route('subscribers.store'), $payload)
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('subscribers.index'));

        $this->assertDatabaseHas('subscribers', [
            'national_id' => $payload['national_id'],
            'circuit_breaker_id' => $circuitBreaker->id,
            'minimum_charge' => 35,
        ]);
    }

    public function test_a_user_without_the_permission_cannot_override_minimum_charge(): void
    {
        $payload = $this->validPayload();
        $circuitBreaker = CircuitBreaker::factory()->create(['ampere' => 4, 'minimum_payment' => 20]);
        $payload['circuit_breaker_id'] = $circuitBreaker->id;
        $payload['minimum_charge'] = 999;

        $this->post(route('subscribers.store'), $payload)
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('subscribers.index'));

        $this->assertDatabaseHas('subscribers', [
            'national_id' => $payload['national_id'],
            'circuit_breaker_id' => $circuitBreaker->id,
            'minimum_charge' => 20,
        ]);
    }

    public function test_a_user_without_the_permission_keeps_the_existing_minimum_charge_on_update_with_no_circuit_breaker(): void
    {
        $dataEntry = User::factory()->dataEntry()->create();
        $this->actingAs($dataEntry);
        $subscriber = Subscriber::factory()->create([
            'branch_id' => $dataEntry->branch_id,
            'circuit_breaker_id' => null,
            'minimum_charge' => 42,
        ]);

        $payload = [
            'full_name' => $subscriber->full_name,
            'national_id' => $subscriber->national_id,
            'phone' => $subscriber->phone,
            'address' => $subscriber->address,
            'tariff_id' => $subscriber->tariff_id,
            'status' => $subscriber->status->value,
            'minimum_charge' => 999,
            'initial_reading' => $subscriber->initial_reading,
            'notes' => $subscriber->notes,
        ];

        $this->put(route('subscribers.update', $subscriber), $payload)
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('subscribers.index'));

        $this->assertDatabaseHas('subscribers', [
            'id' => $subscriber->id,
            'minimum_charge' => 42,
        ]);
    }
}
