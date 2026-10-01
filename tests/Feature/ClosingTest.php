<?php

namespace Tests\Feature;

use App\Enums\ClosingMatchStatus;
use App\Enums\ClosingStatus;
use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\ClosingPayment;
use App\Models\Permission;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class ClosingTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;

    private Subscriber $subscriber;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.business_timezone' => 'Asia/Gaza']);
        $this->travelTo(Carbon::parse('2026-10-01 10:00', 'Asia/Gaza'));
        $this->branch = Branch::factory()->create(['name' => 'فرع النصيرات']);
        $this->subscriber = Subscriber::factory()->create(['branch_id' => $this->branch->id]);
    }

    public function test_the_daily_closing_groups_the_branchs_confirmed_payments_of_that_day_only(): void
    {
        $accountant = $this->preparer();
        $cash = $this->payment('1000', 'cash', '2026-09-30 09:14');
        $bank = $this->payment('600', 'bank_transfer', '2026-09-30 10:42', 'بنك فلسطين');
        $this->payment('500', 'cash', '2026-09-29 22:00');
        $this->payment('400', 'cash', '2026-10-01 00:05');
        $this->payment('300', 'cash', '2026-09-30 11:00', subscriber: Subscriber::factory()->create());
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

    public function test_today_cannot_be_closed_before_the_day_ends(): void
    {
        $this->actingAs($this->preparer())->get(route('closings.index', ['date' => '2026-10-01']))
            ->assertInertia(fn ($page) => $page->where('date', '2026-09-30')->where('daily.day', '2026-09-30'));
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

        $this->assertDatabaseHas('closing_payments', ['closing_id' => $closing->id, 'subscriber_transaction_id' => $payment->id]);
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

    private function payment(string $amount, string $method, string $at, ?string $bank = null, ?Subscriber $subscriber = null): SubscriberTransaction
    {
        $this->travelTo(Carbon::parse($at, 'Asia/Gaza'));
        $payment = SubscriberTransaction::recordPayment($subscriber ?? $this->subscriber, User::factory()->create(), [
            'amount' => $amount,
            'currency' => 'ILS',
            'payment_method' => $method,
            'bank_name' => $bank,
            'sender_name' => 'Subscriber',
            'reference_number' => $bank ? 'REF-'.$amount : null,
        ]);
        $this->travelTo(Carbon::parse('2026-10-01 10:00', 'Asia/Gaza'));

        return $payment;
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
