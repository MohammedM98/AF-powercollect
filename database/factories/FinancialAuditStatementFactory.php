<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\FinancialAuditStatement;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Support\ClosingPeriods;
use App\Support\WeeklyClosingService;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<FinancialAuditStatement> */
class FinancialAuditStatementFactory extends Factory
{
    public function definition(): array
    {
        $day = ClosingPeriods::latestEndedDay()->toDateString();
        [$start, $end] = ClosingPeriods::utcRange($day, $day);

        return [
            'number' => 'AUD-'.fake()->unique()->numerify('#########'), 'branch_id' => Branch::factory(),
            'type' => 'daily', 'period_start' => $day, 'period_end' => $day, 'starts_at' => $start, 'ends_at' => $end,
            'status' => 'pending', 'submitted_by' => User::factory()->accountant(), 'submitted_at' => now(),
            'snapshot' => ['branchName' => 'فرع الاختبار', 'report' => ['lines' => [], 'actualCollectionTotal' => '0.00'],
                'inTransit' => '0.00', 'retained' => '0.00', 'received' => '0.00'],
        ];
    }

    public function withPayment(): static
    {
        return $this->afterMaking(function (FinancialAuditStatement $statement): void {
            $subscription = Subscription::factory()->create(['branch_id' => $statement->branch_id]);
            SubscriptionTransaction::factory()->create([
                'subscription_id' => $subscription->id, 'type' => 'payment', 'source_key' => fake()->uuid(),
                'amount' => '-20.00', 'currency_amount' => '20.00', 'payment_method' => 'cash', 'created_at' => $statement->starts_at->copy()->addHour(),
            ]);
            $statement->snapshot = ['branchName' => $statement->branch->name,
                'report' => app(WeeklyClosingService::class)->reportBetween($statement->starts_at, $statement->ends_at, [$statement->branch_id]),
                'inTransit' => '0.00', 'retained' => '0.00', 'received' => '0.00'];
        });
    }
}
