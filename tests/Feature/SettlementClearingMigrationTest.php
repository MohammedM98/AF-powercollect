<?php

namespace Tests\Feature;

use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SettlementClearingMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_settlement_charges_become_clearings_in_the_subscribers_favour_and_other_charges_stay(): void
    {
        $subscriber = Subscriber::factory()->create();
        $bill = SubscriberTransaction::factory()->for($subscriber)->create(['amount' => '100.00']);
        $settlement = SubscriberTransaction::factory()->for($subscriber)->create(['type' => 'settlement', 'source_key' => 'charge:a', 'amount' => '40.00', 'notes' => 'صيانة']);
        $cancelled = SubscriberTransaction::factory()->for($subscriber)->create(['type' => 'settlement', 'source_key' => 'charge:b', 'amount' => '25.00', 'cancelled_at' => now()]);
        $reversal = SubscriberTransaction::factory()->for($subscriber)->create(['type' => 'reversal', 'source_key' => 'reversal:'.$cancelled->id, 'reverses_id' => $cancelled->id, 'amount' => '-25.00']);
        $penalty = SubscriberTransaction::factory()->for($subscriber)->create(['type' => 'penalty', 'source_key' => 'charge:c', 'amount' => '10.00']);

        (require database_path('migrations/2026_09_29_090000_turn_settlement_charges_into_clearings.php'))->up();

        $this->assertSame(['clearing', '-40.00', 'صيانة'], [$settlement->fresh()->type, $settlement->fresh()->amount, $settlement->fresh()->notes]);
        $this->assertSame(['clearing', '-25.00'], [$cancelled->fresh()->type, $cancelled->fresh()->amount]);
        $this->assertSame(['reversal', '25.00'], [$reversal->fresh()->type, $reversal->fresh()->amount]);
        $this->assertSame(['penalty', '10.00'], [$penalty->fresh()->type, $penalty->fresh()->amount]);
        $this->assertSame('100.00', $bill->fresh()->amount);
        $this->assertSame(70.0, $subscriber->balance());
    }
}
