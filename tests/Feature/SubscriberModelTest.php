<?php

namespace Tests\Feature;

use App\Enums\SubscriberStatus;
use App\Enums\TariffCategory;
use App\Models\Branch;
use App\Models\MeterBox;
use App\Models\Subscriber;
use App\Models\Tariff;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubscriberModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_subscriber_can_be_registered_with_a_meter_box_and_tariff(): void
    {
        $branch = Branch::factory()->create();
        $box = MeterBox::factory()->create(['branch_id' => $branch->id, 'box_number' => 'BOX-0001']);
        $tariff = Tariff::factory()->home()->create();
        $registrar = User::factory()->dataEntry()->create(['branch_id' => $branch->id]);

        $subscriber = Subscriber::factory()->create([
            'meter_box_id' => $box->id,
            'tariff_id' => $tariff->id,
            'branch_id' => $branch->id,
            'registered_by' => $registrar->id,
            'status' => SubscriberStatus::Active,
        ]);

        $this->assertTrue($subscriber->meterBox->is($box));
        $this->assertTrue($subscriber->tariff->is($tariff));
        $this->assertTrue($subscriber->branch->is($branch));
        $this->assertTrue($subscriber->registeredBy->is($registrar));
        $this->assertSame(TariffCategory::Home, $subscriber->tariff->category);
        $this->assertSame(SubscriberStatus::Active, $subscriber->status);

        $this->assertTrue($box->subscribers->contains($subscriber));
        $this->assertTrue($branch->subscribers->contains($subscriber));
        $this->assertTrue($registrar->registeredSubscribers->contains($subscriber));
    }

    public function test_a_meter_box_can_hold_more_than_one_subscriber(): void
    {
        $box = MeterBox::factory()->create();
        $tariff = Tariff::factory()->home()->create();

        Subscriber::factory()->count(2)->create(['meter_box_id' => $box->id, 'tariff_id' => $tariff->id]);

        $this->assertCount(2, $box->fresh()->subscribers);
    }

    public function test_a_subscriber_can_be_registered_without_a_meter_box_yet(): void
    {
        $subscriber = Subscriber::factory()->create(['meter_box_id' => null]);

        $this->assertNull($subscriber->meterBox);
    }

    public function test_the_two_fixed_tariff_categories_are_seeded(): void
    {
        $this->seed(\Database\Seeders\TariffSeeder::class);

        $this->assertDatabaseHas('tariffs', ['category' => TariffCategory::Home->value]);
        $this->assertDatabaseHas('tariffs', ['category' => TariffCategory::Business->value]);
    }
}
