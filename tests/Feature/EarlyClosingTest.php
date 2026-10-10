<?php

namespace Tests\Feature;

use App\Enums\ChargeType;
use App\Enums\ClosingStatus;
use App\Enums\PermissionKey;
use App\Enums\TransactionAction;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\ClosingSetting;
use App\Models\Permission;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class EarlyClosingTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;

    private Subscription $subscription;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        config(['app.business_timezone' => 'Asia/Gaza']);
        $this->travelTo(Carbon::parse('2026-10-01 15:00', 'Asia/Gaza'));
        ClosingSetting::current()->update(['allow_early_close' => true]);
        $this->branch = Branch::factory()->create();
        $this->subscription = Subscription::factory()->create(['branch_id' => $this->branch->id]);
    }

    public function test_a_branch_sends_and_approves_its_day_before_the_cutoff(): void
    {
        $preparer = $this->branchUser();
        $approver = $this->branchUser();
        $this->payment('400');
        $closing = $this->todaysClosing();

        $this->actingAs($preparer)->put(route('closings.count', $closing), ['denominations' => ['200' => 2]])->assertSessionHasNoErrors();
        $this->post(route('closings.submit', $closing))->assertSessionHasNoErrors();
        $this->assertSame(ClosingStatus::Submitted, $closing->fresh()->status);

        $this->actingAs($approver)->post(route('closings.branch-approve', $closing))->assertSessionHasNoErrors();

        $this->assertSame(ClosingStatus::Approved, $closing->fresh()->status);
    }

    public function test_without_the_setting_a_day_is_closed_only_after_its_cutoff(): void
    {
        ClosingSetting::current()->update(['allow_early_close' => false]);
        $preparer = $this->branchUser();
        $closing = $this->todaysClosing();
        $closing->recordCount($preparer, [], null, null);

        $this->actingAs($preparer)->get(route('closings.index', ['date' => '2026-10-01']))
            ->assertInertia(fn ($page) => $page->where('date', '2026-09-30'));
        $this->post(route('closings.submit', $closing))
            ->assertSessionHasErrors(['closing' => 'اليوم لم ينتهِ بعد؛ يُرسل الكشف بعد وقت القطع.']);
        $this->assertSame(ClosingStatus::Draft, $closing->fresh()->status);
    }

    public function test_a_day_already_sent_stays_visible_if_the_setting_is_switched_off_later(): void
    {
        $this->sendTodaysClosing();
        ClosingSetting::current()->update(['allow_early_close' => false]);

        $this->actingAs($this->branchUser())->get(route('closings.index', ['date' => '2026-10-01']))
            ->assertInertia(fn ($page) => $page->where('date', '2026-10-01')->where('daily.status', 'submitted'));
    }

    public function test_the_super_admin_switches_early_closing_on_from_the_schedule_page(): void
    {
        ClosingSetting::current()->update(['allow_early_close' => false]);
        $admin = User::factory()->superAdmin()->create();

        $this->actingAs($admin)->put(route('settings.closing-schedule.update'), ['cutoff_time' => '00:00', 'week_starts_on' => 6, 'auto_open' => true, 'allow_early_close' => true])
            ->assertSessionHasNoErrors();

        $this->assertTrue(ClosingSetting::current()->fresh()->allow_early_close);
        $this->get(route('settings.closing-schedule.edit'))->assertInertia(fn ($page) => $page->where('setting.allow_early_close', true));
    }

    public function test_a_day_that_has_not_started_cannot_be_sent(): void
    {
        $preparer = $this->branchUser();
        $tomorrow = Closing::dailyFor($this->branch, '2026-10-02');

        $this->actingAs($preparer)->post(route('closings.submit', $tomorrow))
            ->assertSessionHasErrors(['closing' => 'هذا اليوم لم يبدأ بعد.']);
        $this->assertSame(ClosingStatus::Draft, $tomorrow->fresh()->status);
    }

    public function test_a_day_closed_early_takes_no_more_payments_or_refunds_until_the_cutoff(): void
    {
        $this->travelTo(Carbon::parse('2026-09-30 11:00', 'Asia/Gaza'));
        $earlier = $this->payment('300');
        $this->travelTo(Carbon::parse('2026-10-01 15:00', 'Asia/Gaza'));
        $this->sendTodaysClosing();

        $this->assertRefused(fn () => $this->payment('100'));
        $this->assertRefused(fn () => $this->refund($earlier));
        $this->assertSame(1, SubscriptionTransaction::query()->where('type', SubscriptionTransaction::TYPE_PAYMENT)->count());
        $this->assertSame(0, SubscriptionTransaction::query()->where('type', SubscriptionTransaction::TYPE_REFUND)->count());
    }

    public function test_a_payment_after_the_cutoff_belongs_to_the_next_day_and_is_not_refused(): void
    {
        $this->payment('400');
        $this->sendTodaysClosing();

        $this->travelTo(Carbon::parse('2026-10-02 00:30', 'Asia/Gaza'));
        $later = $this->payment('100');

        $this->assertTrue(Closing::paymentsReceived($this->branch->id, '2026-10-02', '2026-10-02')->whereKey($later->id)->exists());
        $this->assertFalse(Closing::paymentsReceived($this->branch->id, '2026-10-01', '2026-10-01')->whereKey($later->id)->exists());
    }

    public function test_another_branch_keeps_recording_payments_when_one_branch_closes_early(): void
    {
        $this->sendTodaysClosing();
        $other = Subscription::factory()->create(['branch_id' => Branch::factory()->create()->id]);

        $payment = SubscriptionTransaction::recordPayment($other, User::factory()->create(), $this->paymentData('50'));

        $this->assertNotNull($payment->id);
    }

    public function test_sending_the_day_back_for_correction_opens_it_to_payments_again(): void
    {
        $first = $this->payment('400');
        $closing = $this->sendTodaysClosing();
        $approver = $this->branchUser();

        $this->actingAs($approver)->post(route('closings.branch-return', $closing), ['reason' => 'عُدّ الصندوق من جديد.'])->assertSessionHasNoErrors();
        $late = $this->payment('100');
        $closing->fresh()->syncPayments();

        $this->assertSame(ClosingStatus::Returned, $closing->fresh()->status);
        $this->assertEqualsCanonicalizing([$first->id, $late->id], $closing->lines()->pluck('subscription_transaction_id')->all());
    }

    public function test_the_cash_of_a_day_closed_early_is_handed_over_only_after_the_cutoff(): void
    {
        $this->payment('400');
        $closing = $this->sendTodaysClosing(approve: true);
        $preparer = $this->branchUser();
        $treasurer = User::factory()->accountant()->create();
        $treasurer->permissions()->sync(Permission::idsFor([PermissionKey::AuditClosings]));

        $this->actingAs($preparer)->post(route('closings.transfers.store', $closing), $this->handover($treasurer, '2026-10-01T15:00'))->assertForbidden();

        $this->travelTo(Carbon::parse('2026-10-02 09:00', 'Asia/Gaza'));
        $this->post(route('closings.transfers.store', $closing), $this->handover($treasurer, '2026-10-01T23:00'))
            ->assertSessionHasErrors('sent_at');
        $this->post(route('closings.transfers.store', $closing), $this->handover($treasurer, '2026-10-02T08:00'))
            ->assertSessionHasNoErrors();
        $this->assertDatabaseCount('cash_transfers', 1);
    }

    public function test_the_closing_page_offers_the_day_under_way_with_its_cutoff(): void
    {
        $this->actingAs($this->branchUser())->get(route('closings.index', ['date' => '2026-10-01']))
            ->assertInertia(fn ($page) => $page
                ->where('daily.dayOpen', true)
                ->where('daily.closesAt', '00:00')
                ->where('daily.can.prepare', true));
    }

    private function branchUser(): User
    {
        $user = User::factory()->accountant()->create(['branch_id' => $this->branch->id]);
        $user->permissions()->sync(Permission::idsFor([PermissionKey::PrepareClosings]));

        return $user;
    }

    private function todaysClosing(): Closing
    {
        $closing = Closing::dailyFor($this->branch, '2026-10-01');
        $closing->syncPayments();

        return $closing;
    }

    /**
     * Count the drawer and send today's closing, and approve it too when asked.
     */
    private function sendTodaysClosing(bool $approve = false): Closing
    {
        $preparer = $this->branchUser();
        $closing = $this->todaysClosing();
        $closing->recordCount($preparer, ['100' => intdiv($closing->cashFigures()['expected'], 10000)], null, null);
        $closing->submit($preparer);

        if ($approve) {
            $closing->fresh()->approve($this->branchUser());
        }

        return $closing->fresh();
    }

    private function payment(string $amount): SubscriptionTransaction
    {
        return SubscriptionTransaction::recordPayment($this->subscription, User::factory()->create(), $this->paymentData($amount));
    }

    /**
     * @return array<string, mixed>
     */
    private function paymentData(string $amount): array
    {
        return ['amount' => $amount, 'currency' => 'ILS', 'payment_method' => 'cash'];
    }

    private function refund(SubscriptionTransaction $payment): SubscriptionTransaction
    {
        $actor = User::factory()->superAdmin()->create();
        SubscriptionTransaction::recordCharge($payment->subscription, $actor, ChargeType::Penalty, '1', null);
        $payment->applyAction($actor, TransactionAction::Refund, []);

        return SubscriptionTransaction::query()->where('type', SubscriptionTransaction::TYPE_REFUND)->latest('id')->firstOrFail();
    }

    private function assertRefused(callable $attempt): void
    {
        try {
            $attempt();
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('transaction', $exception->errors());

            return;
        }

        $this->fail('The day was closed early, yet the transaction was recorded.');
    }

    /**
     * @return array<string, mixed>
     */
    private function handover(User $recipient, string $sentAt): array
    {
        return [
            'amount' => '400',
            'method' => 'hand_delivery',
            'recipient_id' => $recipient->id,
            'sent_at' => $sentAt,
            'proof' => UploadedFile::fake()->image('receipt.jpg'),
        ];
    }
}
