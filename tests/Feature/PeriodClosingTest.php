<?php

namespace Tests\Feature;

use App\Enums\ClosingStatus;
use App\Enums\ClosingType;
use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\Permission;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class PeriodClosingTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;

    private User $reviewer;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.business_timezone' => 'Asia/Gaza']);
        $this->travelTo(Carbon::parse('2026-10-05 10:00', 'Asia/Gaza'));
        $this->branch = Branch::factory()->create();
        $this->reviewer = User::factory()->accountant()->create();
        $this->reviewer->permissions()->sync(Permission::idsFor([PermissionKey::AuditClosings]));
    }

    public function test_the_week_is_approved_only_once_every_day_with_payments_has_an_approved_closing(): void
    {
        $this->payment('1000', '2026-09-28 09:00');
        $this->payment('500', '2026-09-30 09:00');
        Closing::factory()->approved()->forDay('2026-09-28')->create(['branch_id' => $this->branch->id]);
        $this->actingAs($this->reviewer);

        $this->get(route('closings.index', ['tab' => 'period', 'date' => '2026-09-30']))->assertInertia(fn ($page) => $page
            ->where('periodView.number', 'W-2026-39')
            ->where('periodView.first', '2026-09-26')
            ->where('periodView.last', '2026-10-02')
            ->where('periodView.collected', '1500.00')
            ->where('periodView.unapproved', 1)
            ->where('periodView.rows', fn ($rows): bool => array_column(collect($rows)->firstWhere('branchId', $this->branch->id)['cells'], 'state') === [
                'empty', 'empty', 'approved', 'empty', 'missing', 'empty', 'empty',
            ])
            ->where('periodView.canApprove', false));
        $this->post(route('period-closings.store'), ['period' => 'weekly', 'date' => '2026-09-30'])->assertSessionHasErrors('period');

        Closing::factory()->approved()->forDay('2026-09-30')->create(['branch_id' => $this->branch->id]);
        $this->post(route('period-closings.store'), ['period' => 'weekly', 'date' => '2026-09-30'])->assertSessionHasNoErrors();

        $week = Closing::where('number', 'W-2026-39')->sole();
        $this->assertSame(ClosingType::Weekly, $week->type);
        $this->assertSame(ClosingStatus::Approved, $week->status);
        $this->assertSame($this->reviewer->id, $week->reviewed_by);
        $this->assertSame(0, SubscriberTransaction::whereNot('type', SubscriberTransaction::TYPE_PAYMENT)->count());
        $this->post(route('period-closings.store'), ['period' => 'weekly', 'date' => '2026-09-30'])->assertSessionHasErrors('period');
    }

    public function test_a_period_that_has_not_ended_cannot_be_approved_and_preparers_cannot_approve_periods(): void
    {
        $preparer = User::factory()->accountant()->create(['branch_id' => $this->branch->id]);
        $preparer->permissions()->sync(Permission::idsFor([PermissionKey::PrepareClosings]));

        $this->actingAs($this->reviewer)->post(route('period-closings.store'), ['period' => 'weekly', 'date' => '2026-10-04'])
            ->assertSessionHasErrors(['period' => 'الفترة لم تنتهِ بعد؛ تنتهي يوم 09/10 عند وقت القطع.']);
        $this->actingAs($preparer)->post(route('period-closings.store'), ['period' => 'weekly', 'date' => '2026-09-30'])->assertForbidden();
        $this->assertSame(0, Closing::count());
    }

    public function test_a_month_counts_only_its_own_days_of_a_week_that_spans_two_months(): void
    {
        $this->payment('1000', '2026-09-30 09:00');
        $this->payment('700', '2026-10-01 09:00');

        $this->actingAs($this->reviewer)->get(route('closings.index', ['tab' => 'period', 'period' => 'monthly', 'date' => '2026-09-30', 'branch' => $this->branch->id]))
            ->assertInertia(fn ($page) => $page
                ->where('periodView.number', 'M-2026-09')
                ->where('periodView.collected', '1000.00')
                ->where('periodView.levels.day.total', '1000.00')
                ->where('periodView.levels.week.total', '1700.00')
                ->where('periodView.levels.month.total', '1000.00'));
    }

    private function payment(string $amount, string $at): void
    {
        $this->travelTo(Carbon::parse($at, 'Asia/Gaza'));
        SubscriberTransaction::recordPayment(Subscriber::factory()->create(['branch_id' => $this->branch->id]), User::factory()->create(), [
            'amount' => $amount, 'currency' => 'ILS', 'payment_method' => 'cash',
        ]);
        $this->travelTo(Carbon::parse('2026-10-05 10:00', 'Asia/Gaza'));
    }
}
