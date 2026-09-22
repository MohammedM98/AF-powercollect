<?php

namespace Tests\Feature\Subscribers;

use App\Enums\SubscriberStatus;
use App\Models\CircuitBreaker;
use App\Models\Subscriber;
use App\Models\Tariff;
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
        $this->assertDatabaseMissing('subscribers', ['meter_number' => $payload['meter_number']]);
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
            'phone' => '0770000000',
            'address' => 'Some street',
            'meter_number' => 'MTR-VALIDATION',
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

    public function test_subscriber_circuit_breaker_must_exist(): void
    {
        $payload = $this->validPayload();
        $payload['circuit_breaker_id'] = 999999;

        $this->post(route('subscribers.store'), $payload)->assertSessionHasErrors('circuit_breaker_id');
        $this->assertDatabaseCount('subscribers', 0);
    }

    public function test_address_is_required(): void
    {
        $payload = $this->validPayload();
        unset($payload['address']);

        $this->post(route('subscribers.store'), $payload)
            ->assertSessionHasErrors('address');

        $this->assertDatabaseCount('subscribers', 0);
    }

    public function test_minimum_charge_is_required(): void
    {
        $payload = $this->validPayload();
        unset($payload['minimum_charge']);

        $this->post(route('subscribers.store'), $payload)
            ->assertSessionHasErrors('minimum_charge');

        $this->assertDatabaseCount('subscribers', 0);
    }

    public function test_minimum_charge_can_be_overridden_independent_of_the_circuit_breakers_own_minimum_payment(): void
    {
        $payload = $this->validPayload();
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
}
