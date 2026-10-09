<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Closing;
use App\Models\FinancialAuditStatement;
use App\Models\Subscription;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use App\Support\FinancialAuditService;
use App\Support\WeeklyClosingService;
use Illuminate\Process\InvokedProcess;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

class WeeklyClosingConcurrencyTest extends TestCase
{
    private ?string $isolatedDatabase = null;

    /** @var array<string, mixed> */
    private array $connection = [];

    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('RUN_MYSQL_CLOSING_TESTS') !== '1') {
            $this->markTestSkipped('Set RUN_MYSQL_CLOSING_TESTS=1 to run concurrent MySQL integration tests.');
        }
        $this->assertTrue(app()->environment('testing'));
        $this->connection = [...config('database.connections.mysql'), 'url' => null, 'database' => null];
        foreach (['MYSQL_TEST_USER' => 'username', 'MYSQL_TEST_PASSWORD' => 'password'] as $variable => $key) {
            if (getenv($variable) !== false) {
                $this->connection[$key] = getenv($variable);
            }
        }
        config(['database.connections.closing_test_admin' => $this->connection]);
        $isolatedDatabase = 'powercollect_closing_test_'.strtolower((string) Str::ulid());
        DB::connection('closing_test_admin')->statement('CREATE DATABASE `'.$isolatedDatabase.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        $this->isolatedDatabase = $isolatedDatabase;
        $this->connection['database'] = $this->isolatedDatabase;
        config(['database.connections.closing_test' => $this->connection, 'database.default' => 'closing_test', 'app.business_timezone' => 'Asia/Hebron']);
        Schema::clearResolvedInstance('db.schema');
        $this->artisan('migrate', ['--force' => true])->assertSuccessful();
        $this->travelTo(Carbon::parse('2026-09-28 09:00', 'Asia/Hebron'));
    }

    protected function tearDown(): void
    {
        if ($this->isolatedDatabase !== null) {
            DB::purge('closing_test');
            DB::connection('closing_test_admin')->statement('DROP DATABASE `'.$this->isolatedDatabase.'`');
        }
        parent::tearDown();
    }

    /** @return array{User, Subscription} */
    private function seedCloseableWeek(): array
    {
        $actor = User::factory()->superAdmin()->create();
        $branch = Branch::factory()->create();
        $subscription = Subscription::factory()->create(['branch_id' => $branch->id]);
        SubscriptionTransaction::recordPayment($subscription, $actor, ['amount' => '100', 'currency' => 'ILS', 'payment_method' => 'cash']);
        Closing::factory()->approved()->forDay('2026-09-28')->create(['branch_id' => $branch->id]);

        return [$actor, $subscription];
    }

    private function startWorker(string $operation, User $actor, Subscription $subscription, bool &$ready, ?FinancialAuditStatement $statement = null): InvokedProcess
    {
        return Process::path(base_path())->timeout(20)->env(['APP_ENV' => 'testing', 'CACHE_STORE' => 'array', 'SESSION_DRIVER' => 'array', 'QUEUE_CONNECTION' => 'sync'])
            ->input(json_encode(['connection' => $this->connection, 'operation' => $operation, 'actor' => $actor->id, 'subscription' => $subscription->id, 'statement' => $statement?->id], JSON_THROW_ON_ERROR)."\n")
            ->start([PHP_BINARY, base_path('tests/weekly_closing_worker.php')], function (string $type, string $output) use (&$ready): void {
                $ready = $ready || str_contains($output, 'READY');
            });
    }

    /** @return list<array<string, mixed>> */
    private function race(string $secondOperation, User $actor, Subscription $subscription, string $firstOperation = 'close', ?FinancialAuditStatement $statement = null): array
    {
        DB::beginTransaction();
        if ($statement === null) {
            app(WeeklyClosingService::class)->lock();
        } else {
            FinancialAuditStatement::query()->lockForUpdate()->findOrFail($statement->id);
        }
        $ready = [false, false];
        $workers = [$this->startWorker($firstOperation, $actor, $subscription, $ready[0], $statement), $this->startWorker($secondOperation, $actor, $subscription, $ready[1], $statement)];
        try {
            $deadline = microtime(true) + 15;
            while (in_array(false, $ready, true) && microtime(true) < $deadline) {
                foreach ($workers as $worker) {
                    $worker->running();
                }
            }
            $this->assertSame([true, true], $ready, 'Both workers must reach the shared financial lock.');
        } finally {
            DB::rollBack();
        }
        $results = [];
        foreach ($workers as $worker) {
            $result = $worker->wait();
            $this->assertTrue($result->successful(), $result->errorOutput());
            $results[] = json_decode(trim(Str::after($result->output(), 'READY')), true, 512, JSON_THROW_ON_ERROR);
        }

        return $results;
    }

    public function test_simultaneous_closes_create_exactly_one_snapshot(): void
    {
        [$actor, $subscription] = $this->seedCloseableWeek();

        $results = $this->race('close', $actor, $subscription);

        $this->assertCount(1, array_filter($results, fn (array $result): bool => $result['status'] === 'accepted'), json_encode($results));
        $this->assertSame(1, Closing::where('number', 'W-2026-39')->count());
        $this->assertDatabaseCount('closing_snapshot_lines', 1);
        $this->assertSame('100.00', Closing::where('number', 'W-2026-39')->sole()->snapshot['report']['actualCollectionTotal']);
    }

    public function test_payment_racing_a_close_is_either_included_or_rejected_without_missing_history(): void
    {
        [$actor, $subscription] = $this->seedCloseableWeek();

        $results = $this->race('payment', $actor, $subscription);

        $this->assertSame('accepted', $results[0]['status'], json_encode($results));
        $included = $results[1]['status'] === 'accepted';
        $closing = Closing::where('number', 'W-2026-39')->sole();
        $this->assertSame($included ? '200.00' : '100.00', $closing->snapshot['report']['actualCollectionTotal']);
        $this->assertDatabaseCount('closing_snapshot_lines', $included ? 2 : 1);
        $this->assertSame($included ? 2 : 1, SubscriptionTransaction::where('subscription_id', $subscription->id)->count());
        $this->assertSame(1, Closing::where('number', 'W-2026-39')->count());
    }

    public function test_simultaneous_audit_submissions_create_one_statement_without_new_collections(): void
    {
        [$actor, $subscription] = $this->seedCloseableWeek();
        $count = SubscriptionTransaction::count();
        $results = $this->race('audit-submit', $actor, $subscription, 'audit-submit');

        $this->assertCount(1, array_filter($results, fn (array $result): bool => $result['status'] === 'accepted'), json_encode($results));
        $this->assertDatabaseCount('financial_audit_statements', 1);
        $this->assertDatabaseCount('financial_audit_lines', 1);
        $this->assertDatabaseCount('financial_audit_events', 1);
        $this->assertSame($count, SubscriptionTransaction::count());
    }

    public function test_simultaneous_audit_approvals_record_one_final_decision(): void
    {
        [$sender, $subscription] = $this->seedCloseableWeek();
        $this->travelTo(Carbon::parse('2026-10-05 10:00', 'Asia/Hebron'));
        $service = app(FinancialAuditService::class);
        $statement = $service->submit($sender, $subscription->branch, 'daily', '2026-09-28');
        $auditor = User::factory()->financialAuditor()->create();
        $service->review($auditor, $statement, $statement->lines()->sole(), 'confirm', null);
        $count = SubscriptionTransaction::count();
        $results = $this->race('audit-approve', $auditor, $subscription, 'audit-approve', $statement);

        $this->assertCount(1, array_filter($results, fn (array $result): bool => $result['status'] === 'accepted'), json_encode($results));
        $this->assertSame('audited', $statement->fresh()->status);
        $this->assertSame(1, $statement->events()->where('action', 'audited')->count());
        $this->assertSame($count, SubscriptionTransaction::count());
    }
}
