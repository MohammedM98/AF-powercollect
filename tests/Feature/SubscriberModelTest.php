<?php

namespace Tests\Feature;

use App\Enums\SubscriberStatus;
use App\Enums\TariffCategory;
use App\Models\Branch;
use App\Models\MeterBox;
use App\Models\Subscriber;
use App\Models\Tariff;
use App\Models\User;
use Database\Seeders\TariffSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubscriberModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_subscriber_can_be_registered_with_a_meter_box_and_tariff(): void
    {
        $branch = Branch::factory()->create();
        $box = MeterBox::factory()->create(['branch_id' => $branch->id, 'box_number' => 'BOX-0001']);
        $tariff = Tariff::factory()->residential()->create();
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
        $this->assertSame(TariffCategory::Residential, $subscriber->tariff->category);
        $this->assertSame(SubscriberStatus::Active, $subscriber->status);

        $this->assertTrue($box->subscribers->contains($subscriber));
        $this->assertTrue($branch->subscribers->contains($subscriber));
        $this->assertTrue($registrar->registeredSubscribers->contains($subscriber));
    }

    public function test_a_meter_box_can_hold_more_than_one_subscriber(): void
    {
        $box = MeterBox::factory()->create();
        $tariff = Tariff::factory()->residential()->create();

        Subscriber::factory()->count(2)->create(['meter_box_id' => $box->id, 'tariff_id' => $tariff->id]);

        $this->assertCount(2, $box->fresh()->subscribers);
    }

    public function test_a_subscriber_can_be_registered_without_a_meter_box_yet(): void
    {
        $subscriber = Subscriber::factory()->create(['meter_box_id' => null]);

        $this->assertNull($subscriber->meterBox);
    }

    public function test_new_subscribers_get_sequential_account_numbers_for_the_current_year(): void
    {
        $this->travelTo(now()->setDate(2026, 5, 1));

        $first = Subscriber::factory()->create();
        $second = Subscriber::factory()->create();

        $this->assertSame('202600001', $first->account_number);
        $this->assertSame('202600002', $second->account_number);
    }

    public function test_the_account_number_sequence_restarts_each_year(): void
    {
        $this->travelTo(now()->setDate(2026, 12, 31));
        Subscriber::factory()->count(2)->create();

        $this->travelTo(now()->setDate(2027, 1, 1));

        $this->assertSame('202700001', Subscriber::factory()->create()->account_number);
    }

    public function test_the_two_fixed_tariff_categories_are_seeded(): void
    {
        $this->seed(TariffSeeder::class);

        $this->assertDatabaseHas('tariffs', ['category' => TariffCategory::Residential->value]);
        $this->assertDatabaseHas('tariffs', ['category' => TariffCategory::Commercial->value]);
    }
}
