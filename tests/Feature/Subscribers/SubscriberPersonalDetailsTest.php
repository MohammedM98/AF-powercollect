<?php

namespace Tests\Feature\Subscribers;

use App\Models\Subscriber;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubscriberPersonalDetailsTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_personal_details_change_on_every_subscription_of_the_person(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();
        $subscriber = Subscriber::factory()->create(['branch_id' => $branchAdmin->branch_id, 'full_name' => 'Old Name', 'national_id' => '111111111']);
        $secondSubscription = Subscriber::factory()->create(['branch_id' => $branchAdmin->branch_id, 'subscriber_profile_id' => $subscriber->subscriber_profile_id]);

        $this->actingAs($branchAdmin)
            ->patch(route('subscribers.personal-details.update', $subscriber), [
                'full_name' => 'New Name',
                'national_id' => '٢٢٢ ٢٢٢ ٢٢٢',
                'phone' => '056-222-2222',
                'address' => 'Gaza',
            ])
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'subscriber-personal-details-updated');

        foreach ([$subscriber, $secondSubscription] as $subscription) {
            $subscription->refresh();
            $this->assertSame(['New Name', '222222222', '0562222222', 'Gaza'], [$subscription->full_name, $subscription->national_id, $subscription->phone, $subscription->address]);
        }

        $this->assertSame('222222222', $subscriber->profile->fresh()->national_id);
    }

    public function test_another_persons_identity_number_is_refused(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();
        Subscriber::factory()->create(['branch_id' => $branchAdmin->branch_id, 'national_id' => '333333333']);
        $subscriber = Subscriber::factory()->create(['branch_id' => $branchAdmin->branch_id, 'national_id' => '111111111']);

        $this->actingAs($branchAdmin)
            ->patch(route('subscribers.personal-details.update', $subscriber), ['full_name' => 'Name', 'national_id' => '333333333', 'phone' => '0591111111'])
            ->assertSessionHasErrors(['national_id' => 'رقم الهوية مسجل لشخص آخر.']);

        $this->assertSame('111111111', $subscriber->fresh()->national_id);
    }

    public function test_another_branchs_subscriber_cannot_be_changed(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();
        $foreign = Subscriber::factory()->create(['full_name' => 'Kept Name']);

        $this->actingAs($branchAdmin)
            ->patch(route('subscribers.personal-details.update', $foreign), ['full_name' => 'Changed', 'national_id' => '444444444', 'phone' => '0591111111'])
            ->assertForbidden();

        $this->assertSame('Kept Name', $foreign->fresh()->full_name);
    }
}
