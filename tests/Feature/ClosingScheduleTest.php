<?php

namespace Tests\Feature;

use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Closing;
use App\Models\ClosingSetting;
use App\Models\Permission;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class ClosingScheduleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.business_timezone' => 'Asia/Gaza']);
        $this->travelTo(Carbon::parse('2026-10-01 10:00', 'Asia/Gaza'));
    }

    public function test_the_super_admin_sets_the_cutoff_week_start_and_automatic_opening_by_hand(): void
    {
        $admin = User::factory()->superAdmin()->create();

        $this->actingAs($admin)->put(route('settings.closing-schedule.update'), ['cutoff_time' => '18:00', 'week_starts_on' => 0, 'auto_open' => false])
            ->assertSessionHasNoErrors();

        $setting = ClosingSetting::sole();
        $this->assertSame('18:00', $setting->cutoff());
        $this->assertSame(0, $setting->week_starts_on);
        $this->assertFalse($setting->auto_open);
        $this->assertSame($admin->id, $setting->updated_by);
    }

    #[TestWith(['09:00'])]
    #[TestWith(['25:00'])]
    public function test_the_cutoff_is_midnight_or_from_noon_on(string $cutoff): void
    {
        $this->actingAs(User::factory()->superAdmin()->create())
            ->put(route('settings.closing-schedule.update'), ['cutoff_time' => $cutoff, 'week_starts_on' => 6, 'auto_open' => true])
            ->assertSessionHasErrors('cutoff_time');

        $this->assertSame('00:00', ClosingSetting::current()->cutoff());
    }

    public function test_only_the_super_admin_manages_the_closing_schedule(): void
    {
        $reviewer = User::factory()->accountant()->create();
        $reviewer->permissions()->sync(Permission::idsFor([PermissionKey::AuditClosings, PermissionKey::PrepareClosings]));
        $this->actingAs($reviewer);

        $this->get(route('settings.closing-schedule.edit'))->assertForbidden();
        $this->put(route('settings.closing-schedule.update'), ['cutoff_time' => '18:00', 'week_starts_on' => 6, 'auto_open' => true])->assertForbidden();
        $this->post(route('settings.closing-schedule.open'), ['date' => '2026-09-30'])->assertForbidden();
    }

    public function test_with_an_evening_cutoff_later_payments_count_for_the_next_day(): void
    {
        ClosingSetting::current()->update(['cutoff_time' => '18:00']);
        $branch = Branch::factory()->create();
        $before = $this->payment($branch, '2026-09-29 17:59');
        $after = $this->payment($branch, '2026-09-29 18:00');

        $this->travelTo(Carbon::parse('2026-09-30 18:30', 'Asia/Gaza'));
        Closing::openForActiveBranches('2026-09-29');
        Closing::openForActiveBranches('2026-09-30');

        $this->assertSame([$before->id], Closing::where('branch_id', $branch->id)->whereDate('period_start', '2026-09-29')->sole()->lines()->pluck('subscriber_transaction_id')->all());
        $this->assertSame([$after->id], Closing::where('branch_id', $branch->id)->whereDate('period_start', '2026-09-30')->sole()->lines()->pluck('subscriber_transaction_id')->all());
    }

    public function test_with_automatic_opening_off_closings_open_only_by_hand(): void
    {
        ClosingSetting::current()->update(['auto_open' => false]);
        Branch::factory()->create();

        $this->artisan('closings:open')->assertSuccessful();
        $this->assertSame(0, Closing::count());

        $this->actingAs(User::factory()->superAdmin()->create());
        $this->post(route('settings.closing-schedule.open'), ['date' => '2026-10-01'])->assertSessionHasErrors('date');
        $this->post(route('settings.closing-schedule.open'), ['date' => '2026-09-30'])->assertSessionHasNoErrors();
        $this->assertSame(Branch::where('is_active', true)->count(), Closing::count());
    }

    private function payment(Branch $branch, string $at): SubscriberTransaction
    {
        $this->travelTo(Carbon::parse($at, 'Asia/Gaza'));
        $payment = SubscriberTransaction::recordPayment(Subscriber::factory()->create(['branch_id' => $branch->id]), User::factory()->create(), [
            'amount' => '10', 'currency' => 'ILS', 'payment_method' => 'cash',
        ]);
        $this->travelTo(Carbon::parse('2026-10-01 10:00', 'Asia/Gaza'));

        return $payment;
    }
}
