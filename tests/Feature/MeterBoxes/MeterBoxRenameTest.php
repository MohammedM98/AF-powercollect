<?php

namespace Tests\Feature\MeterBoxes;

use App\Models\MeterBox;
use App\Models\Subscriber;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MeterBoxRenameTest extends TestCase
{
    use RefreshDatabase;

    public function test_renaming_a_meter_box_or_changing_its_number_shows_on_its_subscribers_everywhere(): void
    {
        $superAdmin = User::factory()->superAdmin()->create();
        $box = MeterBox::factory()->create(['name' => 'aaa', 'name_suffix' => '2', 'box_number' => '32342']);
        $subscriber = Subscriber::factory()->create(['branch_id' => $box->branch_id, 'meter_box_id' => $box->id, 'full_name' => 'Ahmed']);

        $this->actingAs($superAdmin)->put(route('meter-boxes.update', $box), [
            'name' => 'acai',
            'name_suffix' => '3',
            'box_number' => '23245',
            'branch_id' => $box->branch_id,
        ])->assertSessionHasNoErrors();

        $this->assertSame($box->id, $subscriber->fresh()->meter_box_id);

        $this->get(route('subscribers.index'))
            ->assertInertia(fn ($page) => $page
                ->where('subscribers.data.0.meterBoxName', 'acai 3')
                ->where('subscribers.data.0.meterBoxNumber', '23245'));
        $this->get(route('subscribers.statement', $subscriber))
            ->assertInertia(fn ($page) => $page->where('subscriber.meterBoxNumber', '23245'));
    }
}
