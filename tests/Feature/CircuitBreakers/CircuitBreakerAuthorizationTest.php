<?php

namespace Tests\Feature\CircuitBreakers;

use App\Enums\PermissionKey;
use App\Models\CircuitBreaker;
use App\Models\Permission;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CircuitBreakerAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_view_circuit_breaker_index(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $this->actingAs($superAdmin)
            ->get(route('circuit-breakers.index'))
            ->assertOk();
    }

    public function test_super_admin_can_create_a_circuit_breaker(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $response = $this->actingAs($superAdmin)->post(route('circuit-breakers.store'), [
            'ampere' => 4,
            'minimum_payment' => 25.50,
        ]);

        $response->assertRedirect(route('circuit-breakers.index'));
        $this->assertDatabaseHas('circuit_breakers', [
            'ampere' => 4,
            'minimum_payment' => 25.50,
        ]);
    }

    public function test_super_admin_can_update_a_circuit_breaker(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $circuit_breaker = CircuitBreaker::factory()->create(['minimum_payment' => 10]);

        $response = $this->actingAs($superAdmin)->put(route('circuit-breakers.update', $circuit_breaker), [
            'ampere' => 4,
            'minimum_payment' => 30,
        ]);

        $response->assertRedirect(route('circuit-breakers.index'));
        $this->assertDatabaseHas('circuit_breakers', [
            'id' => $circuit_breaker->id,
            'minimum_payment' => 30,
        ]);
    }

    public function test_a_circuit_breaker_can_be_saved_without_changing_its_ampere(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $circuitBreaker = CircuitBreaker::factory()->create(['ampere' => 16, 'minimum_payment' => 10]);

        $response = $this->actingAs($superAdmin)->put(route('circuit-breakers.update', $circuitBreaker), [
            'ampere' => 16,
            'minimum_payment' => 25,
        ]);

        $response->assertSessionHasNoErrors();
        $this->assertDatabaseHas('circuit_breakers', ['id' => $circuitBreaker->id, 'minimum_payment' => 25]);
    }

    public function test_cannot_create_two_circuit_breakers_with_the_same_ampere(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        CircuitBreaker::factory()->create(['ampere' => 4]);

        $this->actingAs($superAdmin)->post(route('circuit-breakers.store'), [
            'ampere' => 4,
            'minimum_payment' => 15,
        ])->assertSessionHasErrors('ampere');
    }

    public function test_branch_admin_cannot_view_circuit_breaker_index(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();

        $this->actingAs($branchAdmin)
            ->get(route('circuit-breakers.index'))
            ->assertForbidden();
    }

    public function test_branch_admin_cannot_create_a_circuit_breaker(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();

        $this->actingAs($branchAdmin)
            ->get(route('circuit-breakers.create'))
            ->assertForbidden();

        $this->actingAs($branchAdmin)
            ->post(route('circuit-breakers.store'), ['ampere' => 4, 'minimum_payment' => 15])
            ->assertForbidden();
    }

    public function test_collector_cannot_view_circuit_breakers(): void
    {
        $collector = User::factory()->collector()->create();

        $this->actingAs($collector)
            ->get(route('circuit-breakers.index'))
            ->assertForbidden();
    }

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get(route('circuit-breakers.index'))
            ->assertRedirect(route('login'));
    }

    public function test_view_permission_does_not_allow_writing(): void
    {
        $this->seed(PermissionSeeder::class);
        $collector = User::factory()->collector()->create();
        $collector->permissions()->attach(Permission::where('key', PermissionKey::ViewCircuitBreakers->value)->firstOrFail());
        $circuitBreaker = CircuitBreaker::factory()->create();

        $this->actingAs($collector)->get(route('circuit-breakers.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('can.viewCircuitBreakers', true));
        $this->post(route('circuit-breakers.store'), ['ampere' => 4, 'minimum_payment' => 20])->assertForbidden();
        $this->put(route('circuit-breakers.update', $circuitBreaker), ['ampere' => 4, 'minimum_payment' => 20])->assertForbidden();
    }

    public function test_navigation_is_hidden_without_permission(): void
    {
        $this->actingAs(User::factory()->collector()->create())
            ->get(route('dashboard'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('can.viewCircuitBreakers', false));
    }

    public function test_circuit_breaker_values_must_be_positive_ampere_and_non_negative_payment(): void
    {
        $this->actingAs(User::factory()->superAdmin()->create())
            ->post(route('circuit-breakers.store'), ['ampere' => 0, 'minimum_payment' => -1])
            ->assertSessionHasErrors(['ampere', 'minimum_payment']);

        $this->assertDatabaseCount('circuit_breakers', 0);
    }

    public function test_circuit_breakers_page_can_be_filtered_by_ampere(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        CircuitBreaker::factory()->create(['ampere' => 4, 'minimum_payment' => 10]);
        CircuitBreaker::factory()->create(['ampere' => 8, 'minimum_payment' => 20]);

        $response = $this->actingAs($superAdmin)->get(route('circuit-breakers.index', ['filter' => ['ampere' => 4]]));

        $response->assertOk();
        $response->assertInertia(fn ($page) => $page->has('circuitBreakers.data', 1)
            ->where('circuitBreakers.data.0.ampere', 4));
    }
}
