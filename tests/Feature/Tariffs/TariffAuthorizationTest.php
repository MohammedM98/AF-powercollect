<?php

namespace Tests\Feature\Tariffs;

use App\Enums\TariffCategory;
use App\Models\Tariff;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TariffAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_view_tariff_index(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $this->actingAs($superAdmin)
            ->get(route('tariffs.index'))
            ->assertOk();
    }

    public function test_super_admin_can_create_a_tariff(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();

        $response = $this->actingAs($superAdmin)->post(route('tariffs.store'), [
            'category' => TariffCategory::Home->value,
            'rate' => 25.50,
        ]);

        $response->assertRedirect(route('tariffs.index'));
        $this->assertDatabaseHas('tariffs', [
            'category' => TariffCategory::Home->value,
            'rate' => 25.50,
        ]);
    }

    public function test_super_admin_can_update_a_tariff(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $tariff = Tariff::factory()->home()->create(['rate' => 10]);

        $response = $this->actingAs($superAdmin)->put(route('tariffs.update', $tariff), [
            'category' => TariffCategory::Home->value,
            'rate' => 30,
        ]);

        $response->assertRedirect(route('tariffs.index'));
        $this->assertDatabaseHas('tariffs', [
            'id' => $tariff->id,
            'rate' => 30,
        ]);
    }

    public function test_cannot_create_two_tariffs_with_the_same_category(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        Tariff::factory()->home()->create();

        $this->actingAs($superAdmin)->post(route('tariffs.store'), [
            'category' => TariffCategory::Home->value,
            'rate' => 15,
        ])->assertSessionHasErrors('category');
    }

    public function test_branch_admin_cannot_view_tariff_index(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();

        $this->actingAs($branchAdmin)
            ->get(route('tariffs.index'))
            ->assertForbidden();
    }

    public function test_branch_admin_cannot_create_a_tariff(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();

        $this->actingAs($branchAdmin)
            ->get(route('tariffs.create'))
            ->assertForbidden();

        $this->actingAs($branchAdmin)
            ->post(route('tariffs.store'), ['category' => TariffCategory::Home->value, 'rate' => 15])
            ->assertForbidden();
    }

    public function test_collector_cannot_view_tariffs(): void
    {
        $collector = User::factory()->collector()->create();

        $this->actingAs($collector)
            ->get(route('tariffs.index'))
            ->assertForbidden();
    }

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get(route('tariffs.index'))
            ->assertRedirect(route('login'));
    }
}
