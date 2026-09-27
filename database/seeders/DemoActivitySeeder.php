<?php

namespace Database\Seeders;

use App\Enums\ChargeType;
use App\Enums\DiscountMethod;
use App\Enums\MeterReadingStatus;
use App\Enums\SubscriberStatus;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\CircuitBreaker;
use App\Models\MeterReading;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\Tariff;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Sixty days of made-up work in every branch — new subscribers and their
 * fees, weekly readings and their approval, payments, and the odd charge
 * or discount — so the financial log and the branch performance pages
 * have something to show. For trying the app locally only; it is not
 * part of `db:seed`:
 *
 *     php artisan db:seed --class=DemoActivitySeeder
 */
class DemoActivitySeeder extends Seeder
{
    private const DAYS = 60;

    private const SUBSCRIPTION_FEES = [30, 50, 50, 75, 100];

    /**
     * The real time the seeder started; records are dated by moving the
     * clock back (Carbon::setTestNow) and never later than this.
     */
    private Carbon $startedAt;

    public function run(): void
    {
        $this->startedAt = now();

        if (app()->environment('production')) {
            throw new RuntimeException('DemoActivitySeeder must not run in production.');
        }

        if (Branch::query()->doesntExist()) {
            $this->call(SubscriberSeeder::class);
        }

        try {
            DB::transaction(function (): void {
                foreach (Branch::query()->with('meterBoxes')->get() as $branch) {
                    $this->seedBranch($branch);
                }
            });
        } finally {
            Carbon::setTestNow();
        }
    }

    private function seedBranch(Branch $branch): void
    {
        $today = $this->startedAt->copy()->startOfDay();
        $firstDay = $today->copy()->subDays(self::DAYS - 1);
        $staff = $this->staff($branch);

        // Subscribers from before the sixty days joined over the months before.
        $branch->subscribers()->where('created_at', '>=', $firstDay)->get()->each(function (Subscriber $subscriber) use ($firstDay): void {
            $joinedAt = $firstDay->copy()->subDays(fake()->numberBetween(1, 120))->setTime(fake()->numberBetween(8, 16), fake()->numberBetween(0, 59));
            $subscriber->forceFill(['created_at' => $joinedAt, 'updated_at' => $joinedAt])->saveQuietly();
        });

        for ($day = $firstDay->copy(); $day->lte($today); $day->addDay()) {
            for ($newSubscribers = fake()->numberBetween(0, 3); $newSubscribers > 0; $newSubscribers--) {
                $this->registerSubscriber($branch, $staff['registrars']->random(), $this->timeOn($day));
            }

            if ($day->isSameDay(MeterReading::weekEndFor($day))) {
                $this->readWeek($branch, $staff, $day);
            }

            $this->collectPayments($branch, $staff['collectors'], $day);

            if (fake()->boolean(20)) {
                $this->adjustBalance($branch, $staff['admin'], $day);
            }
        }
    }

    /**
     * The branch's people: those SubscriberSeeder made, plus two collectors
     * and another data-entry clerk.
     *
     * @return array{admin: User, registrars: Collection<int, User>, approver: User, collectors: Collection<int, User>}
     */
    private function staff(Branch $branch): array
    {
        $users = $branch->users()->get();
        $admin = $users->firstWhere('role', UserRole::BranchAdmin) ?? User::factory()->branchAdmin()->create(['branch_id' => $branch->id]);

        $registrars = $users->where('role', UserRole::DataEntry)->values()
            ->push(User::factory()->dataEntry()->create(['branch_id' => $branch->id, 'password' => 'password']));

        return [
            'admin' => $admin,
            'registrars' => $registrars->push($admin),
            'approver' => $users->firstWhere('role', UserRole::Accountant) ?? $admin,
            'collectors' => User::factory()->collector()->count(2)->create(['branch_id' => $branch->id, 'password' => 'password']),
        ];
    }

    private function registerSubscriber(Branch $branch, User $registrar, Carbon $at): void
    {
        Carbon::setTestNow($at);

        $circuitBreaker = CircuitBreaker::query()->inRandomOrder()->first();
        $subscriber = Subscriber::factory()->create([
            'branch_id' => $branch->id,
            'registered_by' => $registrar->id,
            'tariff_id' => Tariff::query()->inRandomOrder()->value('id'),
            'meter_box_id' => $branch->meterBoxes->isNotEmpty() && fake()->boolean(85) ? $branch->meterBoxes->random()->id : null,
            'circuit_breaker_id' => $circuitBreaker?->id,
            'minimum_charge' => $circuitBreaker?->minimum_payment ?? 20,
            'status' => fake()->randomElement([SubscriberStatus::Active, SubscriberStatus::Active, SubscriberStatus::Active, SubscriberStatus::Suspended]),
            'subscription_fee' => fake()->randomElement(self::SUBSCRIPTION_FEES),
            'subscription_date' => $at->toDateString(),
        ]);

        $subscriber->transactions()->create([
            'recorded_by' => $registrar->id,
            'type' => SubscriberTransaction::TYPE_SUBSCRIPTION_FEE,
            'source_key' => 'subscription-fee:'.$subscriber->id,
            'amount' => $subscriber->subscription_fee,
            'currency_amount' => $subscriber->subscription_fee,
        ]);
    }

    /**
     * Every active subscriber's reading for the week ending on `$day`,
     * entered that day and approved the next morning (unless that is still
     * to come).
     *
     * @param  array{admin: User, registrars: Collection<int, User>, approver: User, collectors: Collection<int, User>}  $staff
     */
    private function readWeek(Branch $branch, array $staff, Carbon $day): void
    {
        $weekStart = MeterReading::weekStartFor($day);
        $subscribers = $branch->subscribers()
            ->with(['tariff', 'circuitBreaker'])
            ->where('status', SubscriberStatus::Active)
            ->where('created_at', '<', $weekStart)
            ->get();
        $approvedAt = $day->copy()->addDay()->setTime(10, fake()->numberBetween(0, 50));

        foreach ($subscribers as $subscriber) {
            Carbon::setTestNow($this->timeOn($day));

            $previous = $subscriber->previousReadingBefore($weekStart);
            // Small, since the demo tariffs are priced per kilo at 50 and 120 shekels.
            $consumption = fake()->randomFloat(2, 0.5, 4);
            $reading = MeterReading::create([
                'subscriber_id' => $subscriber->id,
                'branch_id' => $branch->id,
                'week_start' => $weekStart->toDateString(),
                'week_end' => $day->toDateString(),
                'previous_reading' => $previous,
                'current_reading' => $previous + $consumption,
                'consumption' => $consumption,
                'unit_price' => $subscriber->tariff->rate,
                'minimum_payment' => $subscriber->weeklyMinimumPayment(),
                ...MeterReading::chargesFor($consumption, $subscriber->tariff->rate, $subscriber->weeklyMinimumPayment()),
                'status' => MeterReadingStatus::Pending,
                'recorded_by' => $staff['registrars']->random()->id,
            ]);

            if ($approvedAt->lt($this->startedAt)) {
                Carbon::setTestNow($approvedAt->copy()->addSeconds(fake()->numberBetween(0, 3000)));
                $reading->approve($staff['approver']);
            }
        }
    }

    /**
     * @param  Collection<int, User>  $collectors
     */
    private function collectPayments(Branch $branch, Collection $collectors, Carbon $day): void
    {
        $payers = $branch->subscribers()->where('status', SubscriberStatus::Active)->where('created_at', '<', $day)->inRandomOrder()->limit(fake()->numberBetween(2, 7))->get();

        foreach ($payers as $subscriber) {
            Carbon::setTestNow($this->timeOn($day));
            $byTransfer = fake()->boolean(25);

            SubscriberTransaction::recordPayment($subscriber, $collectors->random(), [
                'amount' => fake()->numberBetween(4, 40) * 5,
                'currency' => 'ILS',
                'payment_method' => $byTransfer ? 'bank_transfer' : 'cash',
                'bank_name' => $byTransfer ? fake()->randomElement(config('powercollect.transfer_banks')) : null,
                'sender_name' => $byTransfer ? $subscriber->full_name : null,
                'reference_number' => $byTransfer ? (string) fake()->numberBetween(100000, 999999) : null,
                'cash_box' => $byTransfer ? null : (string) fake()->numberBetween(1, 3),
            ]);
        }
    }

    private function adjustBalance(Branch $branch, User $admin, Carbon $day): void
    {
        $subscriber = $branch->subscribers()->with('tariff')->where('created_at', '<', $day)->inRandomOrder()->first();

        if (! $subscriber) {
            return;
        }

        Carbon::setTestNow($this->timeOn($day));

        if (fake()->boolean()) {
            SubscriberTransaction::recordCharge($subscriber, $admin, fake()->randomElement(ChargeType::cases()), fake()->numberBetween(2, 10) * 5, null);
        } else {
            SubscriberTransaction::recordDiscount($subscriber, $admin, DiscountMethod::Shekel, fake()->numberBetween(1, 6) * 5, null);
        }
    }

    /**
     * A working-hours moment on the given day, never later than the real now.
     */
    private function timeOn(Carbon $day): Carbon
    {
        $at = $day->copy()->setTime(fake()->numberBetween(8, 17), fake()->numberBetween(0, 59), fake()->numberBetween(0, 59));

        return $at->min($this->startedAt);
    }
}
