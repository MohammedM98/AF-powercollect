<?php

namespace Tests\Feature;

use App\Enums\ChargeType;
use App\Enums\CorrectionReason;
use App\Enums\DiscountMethod;
use App\Enums\PermissionKey;
use App\Models\Branch;
use App\Models\Subscriber;
use App\Models\SubscriberTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\ViewErrorBag;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Random sequences of every operation on a subscriber's transaction history
 * (recording, the seven canonical actions, correcting, cancelling, erasing),
 * checking the ledger's invariants after each step and that every action
 * the statement offers can really be applied.
 */
class TransactionHistoryInvariantsTest extends TestCase
{
    use RefreshDatabase;

    private User $actor;

    private Subscriber $subscriber;

    /** @var array<int, string> */
    private array $trace = [];

    protected function setUp(): void
    {
        parent::setUp();

        $branch = Branch::factory()->create();
        $this->actor = User::factory()->branchAdmin()->withPermissions([
            PermissionKey::ForceDeleteTransactions,
            PermissionKey::DeleteTransactions,
            PermissionKey::CorrectTransactions,
            PermissionKey::AmendTransactionDetails,
            PermissionKey::RefundPayments,
            PermissionKey::AdjustBalances,
        ])->create(['branch_id' => $branch->id]);
        $this->subscriber = Subscriber::factory()->create(['branch_id' => $branch->id]);
    }

    /**
     * @return array<string, array{int, bool}>
     */
    public static function seeds(): array
    {
        $cases = [];

        foreach (range(1, 40) as $seed) {
            $cases["seed {$seed} with time moving"] = [$seed, true];
        }

        foreach (range(101, 120) as $seed) {
            $cases["seed {$seed} within one second"] = [$seed, false];
        }

        return $cases;
    }

    #[DataProvider('seeds')]
    public function test_the_ledger_stays_sound_through_any_sequence_of_operations(int $seed, bool $timeMoves): void
    {
        mt_srand($seed);
        Carbon::setTestNow(Carbon::parse('2026-10-01 08:00:00'));

        for ($step = 1; $step <= 25; $step++) {
            if ($timeMoves) {
                Carbon::setTestNow(now()->addMinutes(7));
            }

            $this->performRandomStep($step);
            $this->assertLedgerIsSound();
        }
    }

    public function test_erasing_the_last_line_keeps_the_running_balance_of_a_reversal_recorded_after_it(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-01 08:00:00'));
        $penalty = SubscriberTransaction::recordCharge($this->subscriber, $this->actor, ChargeType::Penalty, '50', 'غرامة');
        Carbon::setTestNow(now()->addMinute());
        $payment = SubscriberTransaction::recordPayment($this->subscriber, $this->actor, ['amount' => '226', 'currency' => 'ILS', 'payment_method' => 'cash']);
        Carbon::setTestNow(now()->addMinute());

        $this->actingAs($this->actor)
            ->post(route('subscribers.transactions.actions.store', [$this->subscriber, $penalty]), ['action' => 'cancel', 'correction_reason' => 'other', 'correction_notes' => 'اختبار'])
            ->assertSessionHasNoErrors();
        $this->actingAs($this->actor)
            ->delete(route('subscribers.transactions.force-destroy', [$this->subscriber, $payment]), ['correction_notes' => 'اختبار'])
            ->assertSessionHasNoErrors();

        $this->assertSame(0.0, $this->subscriber->balance());
        $this->assertSame(['50.00', '0.00'], $this->subscriber->transactions()->orderBy('id')->pluck('balance_after')->all());
    }

    private function performRandomStep(int $step): void
    {
        $roll = mt_rand(1, 100);

        if ($roll <= 35 || $this->subscriber->transactions()->count() === 0) {
            $this->recordSomething($step);

            return;
        }

        $this->applyOfferedAction($step);
    }

    private function recordSomething(int $step): void
    {
        $kind = mt_rand(1, 5);
        $amount = (string) mt_rand(5, 300);

        match ($kind) {
            1 => $this->note($step, 'payment cash '.$amount, SubscriberTransaction::recordPayment($this->subscriber, $this->actor, ['amount' => $amount, 'currency' => 'ILS', 'payment_method' => 'cash'])),
            2 => $this->note($step, 'payment transfer '.$amount, SubscriberTransaction::recordPayment($this->subscriber, $this->actor, ['amount' => $amount, 'currency' => 'ILS', 'payment_method' => 'bank_transfer', 'bank_name' => 'بنك فلسطين', 'sender_name' => 'Ahmad', 'reference_number' => 'REF-'.$step.'-'.mt_rand()])),
            3 => $this->note($step, 'penalty '.$amount, SubscriberTransaction::recordCharge($this->subscriber, $this->actor, ChargeType::Penalty, $amount, 'غرامة')),
            4 => $this->note($step, 'clearing '.$amount, SubscriberTransaction::recordClearing($this->subscriber, $this->actor, $amount, 'تصفية')),
            default => $this->recordDiscountWithinBalance($step),
        };
    }

    private function recordDiscountWithinBalance(int $step): void
    {
        if ($this->subscriber->balance() <= 0) {
            $this->note($step, 'penalty 50 (no balance to discount)', SubscriberTransaction::recordCharge($this->subscriber, $this->actor, ChargeType::Penalty, '50', 'غرامة'));

            return;
        }

        $this->note($step, 'discount 10%', SubscriberTransaction::recordDiscount($this->subscriber, $this->actor, DiscountMethod::Percentage, '10', null));
    }

    private function note(int $step, string $what, SubscriberTransaction $line): void
    {
        $this->trace[] = "#{$step} record {$what} => line {$line->id}";
    }

    private function applyOfferedAction(int $step): void
    {
        $lines = $this->subscriber->transactions()->orderBy('id')->get();
        $offers = [];

        foreach ($lines as $line) {
            foreach ($line->availableActions($this->actor) as $action) {
                $offers[] = [$line, $action];
            }

            if ($line->isCancellable() && ! $line->isReversal()) {
                $offers[] = [$line, 'legacy-delete'];
            }

            if ($line->isCorrectable() && ($line->type === 'penalty' || $line->isPayment() && $line->payment_method?->value === 'cash')) {
                $offers[] = [$line, 'legacy-correct'];
            }

            if ($line->isErasable()) {
                $offers[] = [$line, 'legacy-erase'];
            }
        }

        if ($offers === []) {
            $this->trace[] = "#{$step} nothing to apply";

            return;
        }

        [$line, $action] = $offers[mt_rand(0, count($offers) - 1)];
        $this->trace[] = "#{$step} {$action} on line {$line->id} ({$line->type}, {$line->amount}, {$line->status})";

        $response = match ($action) {
            'legacy-delete' => $this->actingAs($this->actor)->delete(route('subscribers.transactions.destroy', [$this->subscriber, $line]), [
                'correction_reason' => CorrectionReason::forDeletionOf($line)[0]->value,
                'correction_notes' => 'اختبار',
            ]),
            'legacy-correct' => $this->actingAs($this->actor)->put(route('subscribers.transactions.update', [$this->subscriber, $line]), $line->isPayment()
                ? ['amount' => '33', 'currency' => 'ILS', 'payment_method' => 'cash', 'correction_reason' => 'wrong_amount', 'correction_notes' => 'اختبار']
                : ['type' => 'penalty', 'amount' => '44', 'correction_reason' => 'wrong_amount', 'correction_notes' => 'اختبار']),
            'legacy-erase' => $this->actingAs($this->actor)->delete(route('subscribers.transactions.force-destroy', [$this->subscriber, $line]), ['correction_notes' => 'اختبار']),
            default => $this->actingAs($this->actor)->post(route('subscribers.transactions.actions.store', [$this->subscriber, $line]), $this->payloadFor($action, $step)),
        };

        $bag = session('errors');
        $errors = $bag instanceof ViewErrorBag ? $bag->getBag('default')->all() : [];
        $this->assertSame([], $errors, $this->failure("an offered action was refused: {$action} on line {$line->id}: ".implode(' | ', $errors)));
        $this->assertContains($response->getStatusCode(), [200, 302], $this->failure("an offered action failed with {$response->getStatusCode()}"));
    }

    /**
     * @return array<string, string>
     */
    private function payloadFor(string $action, int $step): array
    {
        return match ($action) {
            'edit' => ['action' => 'edit', 'amount' => (string) mt_rand(1, 400), 'amendment_reason' => 'اختبار'],
            'edit_metadata' => ['action' => 'edit_metadata', 'notes' => 'ملاحظة '.$step, 'amendment_reason' => 'اختبار'],
            'cancel' => ['action' => 'cancel', 'correction_reason' => 'other', 'correction_notes' => 'اختبار'],
            'refund' => ['action' => 'refund'],
            default => ['action' => $action, 'correction_notes' => 'اختبار'],
        };
    }

    private function failure(string $message): string
    {
        return $message."\nSequence:\n".implode("\n", $this->trace);
    }

    private function assertLedgerIsSound(): void
    {
        $lines = SubscriberTransaction::query()
            ->where('subscriber_id', $this->subscriber->id)
            ->orderBy('created_at')
            ->orderBy('id')
            ->get();

        $running = 0;

        foreach ($lines as $line) {
            $running += (int) round((float) $line->amount * 100);
            $this->assertSame(
                number_format($running / 100, 2, '.', ''),
                (string) $line->balance_after,
                $this->failure("balance_after of line {$line->id} ({$line->type}) is not the running total"),
            );
        }

        $this->assertSame(round($running / 100, 2), $this->subscriber->balance(), $this->failure('balance() differs from the lines'));

        $byId = $lines->keyBy('id');

        foreach ($lines as $line) {
            if ($line->isReversal()) {
                $this->assertTrue($byId->has($line->reverses_id), $this->failure("reversal {$line->id} points at a missing line"));
                $this->assertSame('active', $line->status, $this->failure("reversal {$line->id} is not active"));

                continue;
            }

            $reversals = $lines->where('reverses_id', $line->id);
            $net = (int) round((float) $line->amount * 100) + (int) round($reversals->sum(fn ($reversal) => (float) $reversal->amount) * 100);

            if ($line->status === 'active') {
                $this->assertFalse($reversals->isNotEmpty() && $net === 0, $this->failure("line {$line->id} is active but fully reversed"));
            } else {
                $this->assertSame(0, $net, $this->failure("line {$line->id} is {$line->status} but its reversals do not cancel it"));
                $this->assertNotNull($line->cancelled_at, $this->failure("line {$line->id} is {$line->status} without a cancellation date"));
            }
        }

        $references = $lines->where('status', 'active')->pluck('active_reference')->filter();
        $this->assertSame($references->count(), $references->unique()->count(), $this->failure('two active payments share a reference'));

        $statement = $this->actingAs($this->actor)->get(route('subscribers.statement', $this->subscriber));
        $statement->assertOk();
        $props = $statement->inertiaProps();
        $this->assertSame(number_format($running / 100, 2, '.', ''), (string) $props['summary']['balance'], $this->failure('the statement balance differs from the ledger'));

        foreach ($props['entries'] as $entry) {
            $line = $byId->get($entry['id']);
            $this->assertNotNull($line, $this->failure("the statement shows a line that does not exist: {$entry['id']}"));
            $this->assertSame($line->availableActions($this->actor), $entry['available_actions'], $this->failure("statement actions differ for line {$line->id}"));
        }

        $this->assertSame($lines->count(), count($props['entries']), $this->failure('the statement does not list every line once'));
    }
}
