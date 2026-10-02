<?php

namespace Tests\Feature\Subscribers;

use App\Models\Subscriber;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubscriberPhoneTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_personal_number_changes_when_the_subscription_has_none_of_its_own(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();
        $subscriber = Subscriber::factory()->create(['branch_id' => $branchAdmin->branch_id, 'phone' => '0591111111', 'subscription_phone' => null]);

        $this->actingAs($branchAdmin)
            ->patch(route('subscribers.phone.update', $subscriber), ['phone' => '٠٥٦ ٢٢٢-٢٢٢٢'])
            ->assertSessionHasNoErrors()
            ->assertSessionHas('status', 'subscriber-phone-updated');

        $this->assertSame('0562222222', $subscriber->fresh()->phone);
        $this->assertSame('0562222222', $subscriber->fresh()->profile->phone);
    }

    public function test_the_subscriptions_own_number_changes_when_it_has_one(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();
        $subscriber = Subscriber::factory()->create(['branch_id' => $branchAdmin->branch_id, 'phone' => '0591111111', 'subscription_phone' => '0593333333']);

        $this->actingAs($branchAdmin)->patch(route('subscribers.phone.update', $subscriber), ['phone' => '0594444444'])->assertSessionHasNoErrors();

        $subscriber->refresh();
        $this->assertSame('0594444444', $subscriber->subscription_phone);
        $this->assertSame('0591111111', $subscriber->phone);
    }

    public function test_a_number_in_the_wrong_format_is_refused(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();
        $subscriber = Subscriber::factory()->create(['branch_id' => $branchAdmin->branch_id, 'phone' => '0591111111', 'subscription_phone' => null]);

        $this->actingAs($branchAdmin)
            ->patch(route('subscribers.phone.update', $subscriber), ['phone' => '0521234567'])
            ->assertSessionHasErrors(['phone' => 'رقم الجوال يجب أن يتكون من 10 أرقام ويبدأ بـ 059 أو 056.']);

        $this->assertSame('0591111111', $subscriber->fresh()->phone);
    }

    public function test_another_branchs_subscriber_cannot_be_changed(): void
    {
        $branchAdmin = User::factory()->branchAdmin()->create();
        $foreign = Subscriber::factory()->create(['phone' => '0591111111', 'subscription_phone' => null]);

        $this->actingAs($branchAdmin)->patch(route('subscribers.phone.update', $foreign), ['phone' => '0594444444'])->assertForbidden();

        $this->assertSame('0591111111', $foreign->fresh()->phone);
    }
}
