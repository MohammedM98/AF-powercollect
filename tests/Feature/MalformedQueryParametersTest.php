<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

/**
 * A hand-edited URL that sends a list (`?search[]=x`) where the page
 * expects a single value falls back to the unfiltered page instead of a
 * server error.
 */
class MalformedQueryParametersTest extends TestCase
{
    use RefreshDatabase;

    #[TestWith(['/subscribers?search[]=x'])]
    #[TestWith(['/subscribers?sort[]=full_name&direction[]=desc'])]
    #[TestWith(['/users?search[]=x'])]
    #[TestWith(['/meter-reading-approvals?search[]=x&sort[]=week_start'])]
    #[TestWith(['/financial-log?search[]=x&period[]=7'])]
    #[TestWith(['/financial-log?filter[branch_id][]=1'])]
    #[TestWith(['/branch-performance?sort[]=revenue'])]
    public function test_list_parameters_sent_as_arrays_are_ignored(string $url): void
    {
        $this->actingAs(User::factory()->superAdmin()->create())
            ->get($url)
            ->assertOk();
    }
}
