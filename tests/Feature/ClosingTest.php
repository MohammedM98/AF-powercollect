<?php

namespace Tests\Feature;

use App\Enums\ChargeType;
use App\Enums\ClosingMatchStatus;
use App\Enums\ClosingStatus;
use App\Enums\PermissionKey;
use App\Enums\TransactionAction;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\ClosingPayment;
use App\Models\ClosingSetting;
use App\Models\Permission;
use App\Models\SplitPayment;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class ClosingTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;

    private Subscription $subscription;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.business_timezone' => 'Asia/Gaza']);
        $this->travelTo(Carbon::parse('2026-10-01 10:00', 'Asia/Gaza'));
        $this->branch = Branch::factory()->create(['name' => 'فرع النصيرات']);
        $this->subscription = Subscription::factory()->create(['branch_id' => $this->branch->id]);
    }

    public function test_the_daily_closing_groups_the_branchs_confirmed_payments_of_that_day_only(): void
    {
        $accountant = $this->preparer();
        $cash = $this->payment('1000', 'cash', '2026-09-30 09:14');
        $bank = $this->payment('600', 'bank_transfer', '2026-09-30 10:42', 'بنك فلسطين');
        $this->payment('500', 'cash', '2026-09-29 22:00');
        $this->payment('400', 'cash', '2026-10-01 00:05');
        $this->payment('300', 'cash', '2026-09-30 11:00', subscription: Subscription::factory()->create());
        $cancelled = $this->payment('250', 'cash', '2026-09-30 12:00');
        $cancelled->forceFill(['cancelled_at' => now()])->save();

        $response = $this->actingAs($accountant)->get(route('closings.index', ['date' => '2026-09-30']));

        $response->assertInertia(fn ($page) => $page
            ->component('Closings/Index')
            ->where('daily.number', '5001')
            ->where('daily.status', 'draft')
            ->where('daily.total', '1600.00')
            ->where('daily.lines', fn ($lines): bool => collect($lines)->pluck('paymentId')->all() === [$cash->id, $bank->id])
            ->where('daily.accounts', fn ($accounts): bool => collect($accounts)->map(fn ($account) => [$account['key'], $account['total'], $account['pending']])->all() === [
                ['cash', '1000.00', 0],
                ['بنك فلسطين', '600.00', 1],
            ])
            ->where('daily.cash.expected', '1000.00')
            ->where('daily.cash.counted', null));
        $this->get(route('closings.index', ['date' => '2026-09-30']))->assertInertia(fn ($page) => $page->where('daily.number', '5001'));
        $this->assertDatabaseCount('closings', 1);
        $this->assertDatabaseCount('closing_payments', 2);
    }

    public function test_a_transfer_payment_that_is_part_of_a_split_transfer_says_so_in_the_closing(): void
    {
        $accountant = $this->preparer();
        $part = $this->payment('600', 'bank_transfer', '2026-09-30 10:42', 'بنك فلسطين');
        $this->payment('150', 'bank_transfer', '2026-09-30 11:00', 'جوال باي');
        $split = SplitPayment::factory()->create(['total_amount' => 1000, 'recorded_by' => $accountant->id]);
        $part->update(['split_payment_id' => $split->id]);

        $this->actingAs($accountant)->get(route('closings.index', ['date' => '2026-09-30']))
            ->assertInertia(fn ($page) => $page->where('daily.lines', fn ($lines): bool => collect($lines)->pluck('splitPayment', 'paymentId')->filter()->all() === [$part->id => ['id' => $split->id, 'total' => '1000']]));
    }

    public function test_the_cash_count_takes_agorot_so_a_payment_with_them_counts_to_the_cent(): void
    {
        $accountant = $this->preparer();
        $this->payment('150.55', 'cash', '2026-09-30 09:14');
        $closing = $this->closingFor('2026-09-30', $accountant);
        $this->actingAs($accountant);

        $this->put(route('closings.count', $closing), ['denominations' => ['100' => 1, '50' => 1, 'agorot' => 55]])->assertSessionHasNoErrors();

        $this->put(route('closings.count', $closing), ['denominations' => ['100' => 1, '50' => 1, 'agorot' => 55]]);
        $closing->refresh();
        $this->assertSame('150.55', $closing->counted_cash);
        $this->assertEquals(['100' => 1, '50' => 1, 'agorot' => 55], $closing->denominations);
        $this->post(route('closings.submit', $closing))->assertSessionHasNoErrors();
        $this->assertSame(0, $closing->fresh()->cashFigures()['difference']);
    }

    public function test_the_agorot_of_a_cash_count_are_less_than_a_shekel(): void
    {
        $accountant = $this->preparer();
        $this->payment('100', 'cash', '2026-09-30 09:14');
        $closing = $this->closingFor('2026-09-30', $accountant);

        $this->actingAs($accountant)->put(route('closings.count', $closing), ['denominations' => ['100' => 1, 'agorot' => 100]])->assertSessionHasErrors('denominations.agorot');
        $this->put(route('closings.count', $closing), ['denominations' => ['100' => 1, 'agorot' => -1]])->assertSessionHasErrors('denominations.agorot');
        $this->put(route('closings.count', $closing), ['denominations' => ['100' => 1, 'agorot' => 'x']])->assertSessionHasErrors('denominations.agorot');
        $this->assertNull($closing->fresh()->counted_cash);
    }

    public function test_today_can_be_opened_to_close_by_hand_but_a_future_day_cannot(): void
    {
        ClosingSetting::current()->update(['allow_early_close' => true]);
        $preparer = $this->preparer();
        $preparer->permissions()->attach(Permission::idsFor([PermissionKey::CloseDayEarly]));
        $this->actingAs($preparer)->get(route('closings.index', ['date' => '2026-10-01']))
            ->assertInertia(fn ($page) => $page->where('date', '2026-10-01')->where('daily.day', '2026-10-01')->where('daily.dayOpen', true));
        $this->get(route('closings.index', ['date' => '2026-10-05']))
            ->assertInertia(fn ($page) => $page->where('date', '2026-10-01')->where('today', '2026-10-01'));
        $this->get(route('closings.index', ['tab' => 'handover', 'date' => '2026-10-01']))
            ->assertInertia(fn ($page) => $page->where('date', '2026-09-30'));
    }

    public function test_a_cash_shortage_needs_its_reason_and_every_transfer_must_be_matched_before_sending_for_review(): void
    {
        $accountant = $this->preparer();
        $this->payment('1000', 'cash', '2026-09-30 09:14');
        $this->payment('600', 'bank_transfer', '2026-09-30 10:42', 'بنك فلسطين');
        $closing = $this->closingFor('2026-09-30', $accountant);
        $this->actingAs($accountant);

        $this->post(route('closings.submit', $closing))->assertSessionHasErrors(['closing' => 'عُدّ النقد في الصندوق أولًا.']);
        $this->put(route('closings.count', $closing), ['denominations' => ['200' => 4, '100' => 1, '50' => 1]])->assertSessionHasNoErrors();
        $this->post(route('closings.submit', $closing))->assertSessionHasErrors(['closing' => 'اذكر سبب الفرق بين النقد المعدود والمتوقع.']);
        $this->put(route('closings.count', $closing), [
            'denominations' => ['200' => 4, '100' => 1, '50' => 1],
            'difference_reason' => 'wrong_change',
            'difference_notes' => 'أعاد المحصّل باقيًا زائدًا لمشترك.',
        ]);
        $this->post(route('closings.submit', $closing))->assertSessionHasErrors(['closing' => 'طابِق كل تحويل مع حركة الحساب المستلم، أو انقله إلى المعلّقة.']);
        $this->assertSame(ClosingStatus::Draft, $closing->fresh()->status);

        $this->put(route('closings.lines.match', [$closing, $closing->lines()->whereNotNull('match_status')->sole()]), ['status' => 'matched']);
        $this->post(route('closings.submit', $closing))->assertSessionHasNoErrors();

        $closing->refresh();
        $this->assertSame(ClosingStatus::Submitted, $closing->status);
        $this->assertSame('950.00', $closing->counted_cash);
        $this->assertSame('0.00', $closing->opening_cash);
        $this->assertSame($accountant->id, $closing->prepared_by);
        $this->assertSame(-5000, $closing->cashFigures()['difference']);
        $this->put(route('closings.count', $closing), ['denominations' => ['200' => 5]])->assertForbidden();
    }

    public function test_a_transfer_not_found_in_the_account_waits_outside_the_closing_total(): void
    {
        $accountant = $this->preparer();
        $this->payment('200', 'bank_transfer', '2026-09-30 12:05', 'جوال باي');
        $this->payment('150', 'bank_transfer', '2026-09-30 13:00', 'محفظة بالباي');
        $closing = $this->closingFor('2026-09-30', $accountant);
        $line = $closing->lines()->get()->firstWhere(fn (ClosingPayment $line) => $line->payment->bank_name === 'محفظة بالباي');

        $this->actingAs($accountant)->put(route('closings.lines.match', [$closing, $line]), ['status' => 'unconfirmed'])->assertSessionHasNoErrors();

        $this->get(route('closings.index', ['date' => '2026-09-30']))->assertInertia(fn ($page) => $page
            ->where('daily.total', '200.00')
            ->where('daily.unconfirmedTotal', '150.00')
            ->has('daily.unconfirmed', 1)
            ->has('daily.lines', 1));
    }

    public function test_the_reviewer_returns_with_a_reason_and_whoever_prepared_the_closing_cannot_approve_it(): void
    {
        $accountant = $this->preparer();
        $preparingReviewer = $this->reviewer([PermissionKey::PrepareClosings]);
        $reviewer = $this->reviewer();
        $this->payment('1000', 'cash', '2026-09-30 09:14');
        $closing = $this->submittedClosing($preparingReviewer);

        $this->actingAs($accountant)->post(route('closings.approve', $closing))->assertForbidden();
        $this->actingAs($preparingReviewer)->post(route('closings.approve', $closing))
            ->assertSessionHasErrors(['closing' => 'لا يمكنك اعتماد كشف أعددته بنفسك؛ يعتمده مدقق آخر.']);
        $this->actingAs($reviewer)->post(route('closings.return', $closing), ['reason' => ''])->assertSessionHasErrors('reason');

        $this->post(route('closings.return', $closing), ['reason' => 'أرفق إشعار بنك فلسطين للدفعة.'])->assertSessionHasNoErrors();

        $closing->refresh();
        $this->assertSame(ClosingStatus::Returned, $closing->status);
        $this->assertSame('أرفق إشعار بنك فلسطين للدفعة.', $closing->return_reason);
        $this->actingAs($accountant)->post(route('closings.submit', $closing))->assertSessionHasNoErrors();
        $this->actingAs($reviewer)->post(route('closings.approve', $closing))->assertSessionHasNoErrors();
        $this->assertSame(ClosingStatus::Approved, $closing->fresh()->status);
        $this->assertSame($reviewer->id, $closing->fresh()->reviewed_by);
        $this->assertSame(['created', 'counted', 'submitted', 'returned', 'submitted', 'approved'], $closing->events()->orderBy('id')->pluck('action')->all());
    }

    public function test_an_approved_closing_keeps_its_payments_even_if_one_is_cancelled_later(): void
    {
        $accountant = $this->preparer();
        $payment = $this->payment('1000', 'cash', '2026-09-30 09:14');
        $closing = $this->submittedClosing($accountant);
        $this->actingAs($this->reviewer())->post(route('closings.approve', $closing));
        $payment->forceFill(['cancelled_at' => now()])->save();

        $closing->fresh()->syncPayments();

        $this->assertDatabaseHas('closing_payments', ['closing_id' => $closing->id, 'subscription_transaction_id' => $payment->id]);
        $this->actingAs($accountant)->put(route('closings.lines.match', [$closing, $closing->lines()->sole()]), ['status' => 'matched'])->assertForbidden();
    }

    public function test_preparers_only_reach_their_own_branch_and_others_cannot_open_closings(): void
    {
        $accountant = $this->preparer();
        $otherBranch = Branch::factory()->create();
        $otherClosing = Closing::dailyFor($otherBranch, '2026-09-30');

        $this->actingAs($accountant)->get(route('closings.index', ['branch' => $otherBranch->id, 'date' => '2026-09-30']))
            ->assertInertia(fn ($page) => $page->where('branchId', $this->branch->id)->has('branches', 1));
        $this->put(route('closings.count', $otherClosing), ['denominations' => ['200' => 1]])->assertForbidden();
        $this->actingAs(User::factory()->collector()->create(['branch_id' => $this->branch->id]))->get(route('closings.index'))->assertForbidden();
        auth()->logout();
        $this->get(route('closings.index'))->assertRedirect(route('login'));
    }

    public function test_the_next_days_opening_cash_is_what_was_counted_less_what_was_handed_over_in_between(): void
    {
        $accountant = $this->preparer();
        $this->payment('1000', 'cash', '2026-09-28 09:00');
        $first = $this->closingFor('2026-09-28', $accountant);
        $first->recordCount($accountant, ['200' => 5], null, null);
        $first->transfers()->create([
            'branch_id' => $this->branch->id, 'amount' => '600', 'method' => 'hand_delivery', 'sent_by' => $accountant->id,
            'recipient_id' => User::factory()->superAdmin()->create()->id, 'sent_at' => Carbon::parse('2026-09-29 09:00', 'Asia/Gaza'), 'proof_path' => 'p.jpg',
        ]);
        $this->payment('300', 'cash', '2026-09-30 09:00');

        $this->actingAs($accountant)->get(route('closings.index', ['date' => '2026-09-30']))->assertInertia(fn ($page) => $page
            ->where('daily.cash.opening', '400.00')
            ->where('daily.cash.receipts', '300.00')
            ->where('daily.cash.expected', '700.00'));
    }

    public function test_every_active_branch_gets_its_daily_closing_with_its_own_payments_after_the_day_ends(): void
    {
        $secondBranch = Branch::factory()->create();
        $stoppedBranch = Branch::factory()->create(['is_active' => false]);
        $first = $this->payment('1000', 'cash', '2026-09-30 09:14');
        $second = $this->payment('300', 'cash', '2026-09-30 11:00', subscription: Subscription::factory()->create(['branch_id' => $secondBranch->id]));
        $activeBranches = Branch::where('is_active', true)->count();

        $this->artisan('closings:open')->assertSuccessful();
        $this->artisan('closings:open')->assertSuccessful();

        $this->assertSame($activeBranches, Closing::count());
        $this->assertDatabaseMissing('closings', ['branch_id' => $stoppedBranch->id]);
        $this->assertSame([$first->id], Closing::where('branch_id', $this->branch->id)->sole()->lines()->pluck('subscription_transaction_id')->all());
        $this->assertSame([$second->id], Closing::where('branch_id', $secondBranch->id)->sole()->lines()->pluck('subscription_transaction_id')->all());
        $this->artisan('closings:open', ['--date' => '2026-10-01'])->assertFailed();
    }

    public function test_a_cash_refund_comes_off_the_expected_cash_of_the_day_it_is_paid_out_not_the_day_it_was_collected(): void
    {
        $accountant = $this->preparer();
        $refunded = $this->payment('100', 'cash', '2026-09-29 09:00');
        $this->payment('50', 'cash', '2026-09-29 10:00', subscription: Subscription::factory()->create(['branch_id' => $this->branch->id]));
        $first = $this->closingFor('2026-09-29', $accountant);
        $first->recordCount($accountant, ['100' => 1, '50' => 1], null, null);
        $first->submit($accountant);
        $this->actingAs($this->reviewer())->post(route('closings.approve', $first));

        $this->refund($refunded, '2026-09-30 11:00');

        $this->assertSame(
            ['receipts' => 15000, 'expenses' => 0, 'expected' => 15000, 'difference' => 0],
            collect($first->fresh()->cashFigures())->only(['receipts', 'expenses', 'expected', 'difference'])->all(),
        );
        $this->assertSame([$refunded->id], $first->fresh()->lines()->orderBy('id')->pluck('subscription_transaction_id')->take(1)->all());
        $this->actingAs($accountant)->get(route('closings.index', ['date' => '2026-09-30']))->assertInertia(fn ($page) => $page
            ->where('daily.cash.opening', '150.00')
            ->where('daily.cash.receipts', '0.00')
            ->where('daily.cash.expenses', '100.00')
            ->where('daily.cash.expected', '50.00')
            ->where('daily.cashRefunds', fn ($refunds): bool => collect($refunds)->pluck('amount')->all() === ['100.00']));
    }

    public function test_a_refund_on_the_day_of_the_payment_leaves_the_expected_cash_at_zero_rather_than_taking_it_off_twice(): void
    {
        $accountant = $this->preparer();
        $refunded = $this->payment('100', 'cash', '2026-09-30 09:00');
        $this->refund($refunded, '2026-09-30 12:00');

        $this->actingAs($accountant)->get(route('closings.index', ['date' => '2026-09-30']))->assertInertia(fn ($page) => $page
            ->where('daily.cash.receipts', '0.00')
            ->where('daily.cash.expenses', '0.00')
            ->where('daily.cash.expected', '0.00')
            ->has('daily.lines', 0));
    }

    public function test_a_payment_refunded_after_its_day_stays_in_that_days_draft_closing(): void
    {
        $accountant = $this->preparer();
        $refunded = $this->payment('100', 'cash', '2026-09-29 09:00');
        $draft = $this->closingFor('2026-09-29', $accountant);

        $this->refund($refunded, '2026-09-30 11:00');
        $draft->fresh()->syncPayments();

        $this->assertSame([$refunded->id], $draft->fresh()->lines()->pluck('subscription_transaction_id')->all());
        $this->assertSame(10000, $draft->fresh()->cashFigures()['receipts']);
        $this->actingAs($accountant)->get(route('closings.index', ['date' => '2026-09-30']))->assertInertia(fn ($page) => $page
            ->where('daily.cash.expenses', '100.00'));
        $this->get(route('closings.index', ['date' => '2026-09-29']))->assertInertia(fn ($page) => $page
            ->where('daily.total', '100.00'));
        $this->get(route('closings.index', ['date' => '2026-09-29', 'tab' => 'period']))->assertInertia(fn ($page) => $page
            ->where('periodView.levels.day.total', '100.00')
            ->where('periodView.levels.day.count', 1));
    }

    public function test_a_payment_cancelled_by_mistake_is_still_dropped_from_the_draft_closing(): void
    {
        $accountant = $this->preparer();
        $mistaken = $this->payment('100', 'cash', '2026-09-29 09:00');
        $draft = $this->closingFor('2026-09-29', $accountant);
        $mistaken->forceFill(['cancelled_at' => now(), 'status' => SubscriptionTransaction::STATUS_CANCELLED])->save();

        $draft->fresh()->syncPayments();

        $this->assertSame([], $draft->fresh()->lines()->pluck('id')->all());
        $this->assertSame(0, $draft->fresh()->cashFigures()['expenses']);
    }

    public function test_refunding_a_bank_transfer_does_not_touch_the_cash_box(): void
    {
        $accountant = $this->preparer();
        $transfer = $this->payment('100', 'bank_transfer', '2026-09-29 09:00', 'بنك فلسطين');

        $this->refund($transfer, '2026-09-30 11:00');

        $this->actingAs($accountant)->get(route('closings.index', ['date' => '2026-09-30']))->assertInertia(fn ($page) => $page
            ->where('daily.cash.expenses', '0.00')
            ->where('daily.cash.expected', '0.00')
            ->has('daily.cashRefunds', 0));
    }

    public function test_cash_refunded_on_days_without_a_closing_comes_off_the_next_opening_cash(): void
    {
        $accountant = $this->preparer();
        $refunded = $this->payment('100', 'cash', '2026-09-27 09:00');
        $first = $this->closingFor('2026-09-27', $accountant);
        $first->recordCount($accountant, ['100' => 1], null, null);
        $this->refund($refunded, '2026-09-28 11:00');

        $this->actingAs($accountant)->get(route('closings.index', ['date' => '2026-09-29']))->assertInertia(fn ($page) => $page
            ->where('daily.cash.opening', '0.00')
            ->where('daily.cash.expected', '0.00'));
    }

    private function closingFor(string $day, User $actor): Closing
    {
        $closing = Closing::dailyFor($this->branch, $day);
        $closing->syncPayments();

        return $closing;
    }

    private function submittedClosing(User $preparer): Closing
    {
        $closing = $this->closingFor('2026-09-30', $preparer);
        $closing->recordCount($preparer, ['200' => 5], null, null);
        $closing->lines()->whereNotNull('match_status')->update(['match_status' => ClosingMatchStatus::Matched->value]);
        $closing->submit($preparer);

        return $closing->fresh();
    }

    private function payment(string $amount, string $method, string $at, ?string $bank = null, ?Subscription $subscription = null): SubscriptionTransaction
    {
        $this->travelTo(Carbon::parse($at, 'Asia/Gaza'));
        $payment = SubscriptionTransaction::recordPayment($subscription ?? $this->subscription, User::factory()->create(), [
            'amount' => $amount,
            'currency' => 'ILS',
            'payment_method' => $method,
            'bank_name' => $bank,
            'sender_name' => 'Subscription',
            'reference_number' => $bank ? 'REF-'.$amount : null,
        ]);
        $this->travelTo(Carbon::parse('2026-10-01 10:00', 'Asia/Gaza'));

        return $payment;
    }

    /**
     * Refund the whole payment at the given time, as a super admin would;
     * a later charge keeps the payment from being the account's last line.
     */
    private function refund(SubscriptionTransaction $payment, string $at): SubscriptionTransaction
    {
        $actor = User::factory()->superAdmin()->create();
        $this->travelTo(Carbon::parse($at, 'Asia/Gaza'));
        SubscriptionTransaction::recordCharge($payment->subscription, $actor, ChargeType::Penalty, '1', null);
        $payment->applyAction($actor, TransactionAction::Refund, []);
        $this->travelTo(Carbon::parse('2026-10-01 10:00', 'Asia/Gaza'));

        return SubscriptionTransaction::query()->where('type', SubscriptionTransaction::TYPE_REFUND)->latest('id')->firstOrFail();
    }

    private function preparer(): User
    {
        $user = User::factory()->accountant()->create(['branch_id' => $this->branch->id]);
        $user->permissions()->sync(Permission::idsFor([PermissionKey::PrepareClosings]));

        return $user;
    }

    /**
     * @param  array<int, PermissionKey>  $also
     */
    private function reviewer(array $also = []): User
    {
        $user = User::factory()->accountant()->create();
        $user->permissions()->sync(Permission::idsFor([PermissionKey::AuditClosings, ...$also]));

        return $user;
    }
}
