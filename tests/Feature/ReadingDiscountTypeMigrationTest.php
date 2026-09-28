<?php

namespace Tests\Feature;

use App\Models\MeterReading;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReadingDiscountTypeMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_discounts_recorded_with_a_reading_become_reading_discounts_and_discounts_given_by_hand_stay(): void
    {
        $subscriber = Subscriber::factory()->create();
        $reading = MeterReading::factory()->for($subscriber)->approved()->create();
        $readingDiscount = SubscriberTransaction::factory()->for($subscriber)->create([
            'type' => 'discount',
            'meter_reading_id' => $reading->id,
            'source_key' => $reading->discountSourceKey(),
            'amount' => '-90.00',
        ]);
        $givenByHand = SubscriberTransaction::factory()->for($subscriber)->create(['type' => 'discount', 'source_key' => 'discount:by-hand', 'amount' => '-10.00']);

        (require database_path('migrations/2026_09_28_072903_give_reading_discounts_their_own_transaction_type.php'))->up();

        $this->assertSame(SubscriberTransaction::TYPE_READING_DISCOUNT, $readingDiscount->fresh()->type);
        $this->assertSame(SubscriberTransaction::TYPE_DISCOUNT, $givenByHand->fresh()->type);
    }
}
