<?php

namespace Database\Seeders;

use App\Enums\CashBoxType;
use App\Enums\SubscriptionStatus;
use App\Enums\UserRole;
use App\Models\Branch;
use App\Models\CashBox;
use App\Models\CircuitBreaker;
use App\Models\ClosingSetting;
use App\Models\MeterBox;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\Tariff;
use App\Models\User;
use App\Support\BranchClosingWorkflow;
use Illuminate\Database\Seeder;
use RuntimeException;

class CampTwoDemoDataSeeder extends Seeder
{
    public const MARKER = 'camp2-demo-subscribers-v1';

    public function run(BranchClosingWorkflow $workflow): void
    {
        if (! app()->environment(['local', 'testing'])) {
            throw new RuntimeException('Demo subscribers must only be seeded locally or in tests.');
        }

        $branch = Branch::query()->where('name', 'مخيم 2')->sole();
        $collector = User::query()->where('username', CampTwoCollectorSeeder::USERNAME)->where('branch_id', $branch->id)->where('role', UserRole::Collector)->where('is_active', true)->sole();
        $head = User::query()->where('branch_id', $branch->id)->where('role', UserRole::BranchAdmin)->where('is_active', true)->orderBy('id')->firstOrFail();
        $workflow->locked($branch->id, function () use ($workflow, $branch, $collector, $head): void {
            if (Subscription::query()->where('branch_id', $branch->id)->where('notes', self::MARKER)->exists()) {
                $this->command?->info('Demo data already exists; no records were changed.');

                return;
            }
            if (! ClosingSetting::ownFor($branch->id)?->workflow_started_at) {
                throw new RuntimeException('Activate the branch closing workflow before seeding demo cash boxes.');
            }
            if (CashBox::query()->where('branch_id', $branch->id)->where('user_id', $collector->id)->whereHas('payments')->exists()) {
                throw new RuntimeException('The demo collector already has payments; no existing cash box will be closed by this seeder.');
            }

            $meterBox = MeterBox::query()->where('branch_id', $branch->id)->orderBy('id')->firstOrFail();
            $tariff = Tariff::query()->orderBy('id')->firstOrFail();
            $breaker = CircuitBreaker::query()->orderBy('id')->firstOrFail();
            $statuses = [SubscriptionStatus::Active, SubscriptionStatus::Active, SubscriptionStatus::Suspended, SubscriptionStatus::Disconnected, SubscriptionStatus::Active, SubscriptionStatus::Suspended];
            $names = ['أحمد', 'سارة', 'محمد', 'ليلى', 'عمر', 'نور'];
            $subscriptions = [];
            foreach ($statuses as $index => $status) {
                $subscription = Subscription::factory()->create([
                    'branch_id' => $branch->id, 'registered_by' => $head->id, 'meter_box_id' => $meterBox->id,
                    'tariff_id' => $tariff->id, 'circuit_breaker_id' => $breaker->id, 'minimum_charge' => 20,
                    'full_name' => $names[$index].' · مشترك تجريبي', 'subscription_name' => $names[$index].' · مشترك تجريبي',
                    'national_id' => null, 'phone' => null, 'address' => 'مخيم 2 · عنوان تجريبي',
                    'initial_reading' => 1000 + $index * 100, 'status' => $status,
                    'activated_at' => $status === SubscriptionStatus::Disconnected ? now()->subMonth() : null,
                    'notes' => self::MARKER,
                ]);
                $subscription->transactions()->create([
                    'recorded_by' => $head->id, 'type' => SubscriptionTransaction::TYPE_SUBSCRIPTION_FEE,
                    'source_key' => self::MARKER.':charge:'.$subscription->id, 'amount' => '300.00',
                    'notes' => 'رسوم اشتراك تجريبية لعرض الرصيد والحركات المالية',
                ]);
                $subscriptions[] = $subscription;
            }

            $this->payment($subscriptions[0], $collector, '150');
            $this->payment($subscriptions[1], $collector, '20', 'USD');
            $this->payment($subscriptions[2], $collector, '5', 'JOD');
            $this->closeDemoBox($workflow, $branch, $collector, $head);

            $this->payment($subscriptions[0], $collector, '120');
            $this->payment($subscriptions[4], $collector, '10', 'USD');
            $this->closeDemoBox($workflow, $branch, $collector, $head);

            $this->payment($subscriptions[1], $collector, '80');
            $this->payment($subscriptions[3], $collector, '2', 'JOD');
            $this->closeDemoBox($workflow, $branch, $collector, $head);

            $this->payment($subscriptions[4], $collector, '60');
            SubscriptionTransaction::recordPayment($subscriptions[5], $collector, [
                'amount' => '90', 'currency' => 'ILS', 'payment_method' => 'bank_transfer', 'bank_name' => 'بنك فلسطين',
                'sender_name' => 'مرسل تجريبي', 'reference_number' => 'CAMP2-DEMO-TRANSFER-01', 'notes' => self::MARKER,
            ]);
        });

        $this->command?->info('Six demo subscribers and five collector boxes (four cash, one bank transfer) are ready in مخيم 2.');
    }

    private function payment(Subscription $subscription, User $collector, string $amount, string $currency = 'ILS'): void
    {
        SubscriptionTransaction::recordPayment($subscription, $collector, [
            'amount' => $amount, 'currency' => $currency, 'exchange_rate' => ['ILS' => '1', 'USD' => '3.5', 'JOD' => '5'][$currency],
            'payment_method' => 'cash', 'notes' => self::MARKER,
        ]);
    }

    /** The branch confirms the collector's open cash box closed, as it does after reviewing it. */
    private function closeDemoBox(BranchClosingWorkflow $workflow, Branch $branch, User $collector, User $head): void
    {
        $workflow->receive($this->openCashBox($branch, $collector), $head, cashCounted: true);
    }

    private function openCashBox(Branch $branch, User $collector): CashBox
    {
        return CashBox::query()->where('branch_id', $branch->id)->where('user_id', $collector->id)->where('type', CashBoxType::Cash)->where('status', 'open')->sole();
    }
}
