<?php

use App\Http\Concerns\PresentsClosings;
use App\Models\Branch;
use App\Models\FinancialAuditStatement;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Support\ClosingPeriods;
use App\Support\FinancialAuditService;
use App\Support\WeeklyClosingService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Testing\Concerns\InteractsWithTime;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$input = json_decode(fgets(STDIN), true, 512, JSON_THROW_ON_ERROR);
if (! $app->environment('testing') || ! preg_match('/^powercollect_closing_test_[a-z0-9]{26}$/', $input['connection']['database'])) {
    throw new RuntimeException('Concurrency workers may use only an isolated test database.');
}
config(['database.connections.closing_worker' => $input['connection'], 'database.default' => 'closing_worker', 'app.business_timezone' => 'Asia/Hebron']);
$clock = new class
{
    use InteractsWithTime;
};
$clock->travelTo(Carbon::parse($input['operation'] === 'payment' ? '2026-09-28 09:30' : '2026-10-05 10:00', 'Asia/Hebron'));
fwrite(STDOUT, "READY\n");
fflush(STDOUT);
try {
    $actor = User::findOrFail($input['actor']);
    if ($input['operation'] === 'close') {
        $presenter = new class
        {
            use PresentsClosings;

            /** @return array<string, mixed> */
            public function summary(User $actor): array
            {
                return $this->periodData('weekly', ClosingPeriods::date('2026-09-28'), Branch::orderBy('name')->get(), $actor);
            }
        };
        app(WeeklyClosingService::class)->close('2026-09-28', $actor, fn (): array => $presenter->summary($actor));
    } elseif ($input['operation'] === 'audit-submit') {
        app(FinancialAuditService::class)->submit($actor, Subscription::findOrFail($input['subscription'])->branch, 'daily', '2026-09-28');
    } elseif ($input['operation'] === 'audit-approve') {
        app(FinancialAuditService::class)->approve($actor, FinancialAuditStatement::findOrFail($input['statement']), null);
    } else {
        SubscriptionTransaction::recordPayment(Subscription::findOrFail($input['subscription']), $actor, ['amount' => '100', 'currency' => 'ILS', 'payment_method' => 'cash']);
    }
    echo json_encode(['status' => 'accepted'], JSON_THROW_ON_ERROR);
} catch (ValidationException $exception) {
    echo json_encode(['status' => 'rejected', 'errors' => $exception->errors()], JSON_THROW_ON_ERROR);
} catch (AuthorizationException) {
    echo json_encode(['status' => 'rejected'], JSON_THROW_ON_ERROR);
}
