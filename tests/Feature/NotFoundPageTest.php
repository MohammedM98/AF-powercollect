<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class NotFoundPageTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_unknown_address_shows_the_not_found_page(): void
    {
        $this->get('/no-such-page')
            ->assertNotFound()
            ->assertInertia(fn (Assert $page) => $page->component('Errors/NotFound'));
    }

    public function test_a_missing_record_shows_the_not_found_page_to_a_signed_in_user(): void
    {
        $this->actingAs(User::factory()->superAdmin()->create())
            ->get(route('branches.edit', 999))
            ->assertNotFound()
            ->assertInertia(fn (Assert $page) => $page->component('Errors/NotFound'));
    }

    public function test_json_requests_still_get_a_json_error(): void
    {
        $this->getJson('/no-such-page')
            ->assertNotFound()
            ->assertJsonStructure(['message']);
    }

    public function test_other_errors_keep_their_usual_response(): void
    {
        $collector = User::factory()->collector()->create();

        $response = $this->actingAs($collector)->get(route('branches.index'));

        $response->assertForbidden();
        $this->assertStringNotContainsString('Errors/NotFound', $response->getContent());
    }
}
