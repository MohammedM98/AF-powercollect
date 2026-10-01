<?php

namespace App\Models;

use App\Enums\ClosingDifferenceReason;
use App\Enums\ClosingMatchStatus;
use App\Enums\ClosingStatus;
use App\Enums\ClosingType;
use App\Enums\PaymentMethod;
use App\Support\ClosingPeriods;
use Carbon\CarbonInterface;
use Database\Factories\ClosingFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A closing groups payments that already exist for review: one branch's
 * business day (daily), or the whole company's week or month. Creating or
 * approving one never records a payment or moves money. A daily closing
 * goes Draft → Submitted → Approved, or back to the branch as Returned
 * with the reviewer's reason; once approved it is locked.
 */
#[Fillable([
    'number', 'type', 'branch_id', 'period_start', 'period_end', 'status', 'opening_cash', 'counted_cash', 'denominations',
    'difference_reason', 'difference_notes', 'prepared_by', 'submitted_at', 'reviewed_by', 'reviewed_at', 'return_reason',
])]
class Closing extends Model
{
    /** @use HasFactory<ClosingFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return [
            'type' => ClosingType::class,
            'status' => ClosingStatus::class,
            'period_start' => 'date',
            'period_end' => 'date',
            'opening_cash' => 'decimal:2',
            'counted_cash' => 'decimal:2',
            'denominations' => 'array',
            'difference_reason' => ClosingDifferenceReason::class,
            'submitted_at' => 'datetime',
            'reviewed_at' => 'datetime',
        ];
    }

    /**
     * The branch's daily closing for the business day, created the first
     * time anyone opens it after the day is over.
     */
    public static function dailyFor(Branch $branch, CarbonInterface|string $day): self
    {
        $day = ClosingPeriods::date($day);
        $find = fn (): ?self => static::query()
            ->where('type', ClosingType::Daily)
            ->where('branch_id', $branch->id)
            ->whereDate('period_start', $day->toDateString())
            ->first();

        if ($existing = $find()) {
            return $existing;
        }

        try {
            return DB::transaction(function () use ($branch, $day): self {
                $closing = static::create([
                    'number' => (string) static::nextDailyNumber(),
                    'type' => ClosingType::Daily,
                    'branch_id' => $branch->id,
                    'period_start' => $day->toDateString(),
                    'period_end' => $day->toDateString(),
                    'status' => ClosingStatus::Draft,
                ]);
                $closing->record(null, 'created', "أُنشئ الكشف {$closing->number} تلقائيًا عند وقت القطع");

                return $closing;
            });
        } catch (UniqueConstraintViolationException) {
            return $find();
        }
    }

    /**
     * Daily closings are numbered one after another from the configured
     * first number: 5001, 5002…
     */
    public static function nextDailyNumber(): int
    {
        $last = static::query()->where('type', ClosingType::Daily)->orderByDesc('id')->lockForUpdate()->value('number');

        return $last === null ? (int) config('powercollect.closing.first_number') : (int) $last + 1;
    }

    /**
     * The confirmed payments a branch received on a business day: every
     * payment line that has not been cancelled, by the subscriber's branch.
     *
     * @return Builder<SubscriberTransaction>
     */
    public static function paymentsReceived(int $branchId, CarbonInterface|string $first, CarbonInterface|string $last): Builder
    {
        [$from, $until] = ClosingPeriods::utcRange($first, $last);

        return SubscriberTransaction::query()
            ->where('type', SubscriberTransaction::TYPE_PAYMENT)
            ->whereNull('cancelled_at')
            ->where('created_at', '>=', $from)
            ->where('created_at', '<', $until)
            ->whereHas('subscriber', fn (Builder $subscriber) => $subscriber->where('branch_id', $branchId));
    }

    /**
     * Bring the closing's payments up to date while the branch can still
     * change it: add the day's new payments, and drop any that have since
     * been cancelled. A submitted or approved closing keeps its payments.
     */
    public function syncPayments(): void
    {
        if ($this->type !== ClosingType::Daily || ! $this->status->isEditable()) {
            return;
        }

        $payments = static::paymentsReceived($this->branch_id, $this->period_start, $this->period_end)->get(['id', 'payment_method']);

        DB::transaction(function () use ($payments): void {
            $this->lines()->whereNotIn('subscriber_transaction_id', $payments->modelKeys())->delete();
            $linked = ClosingPayment::query()->whereIn('subscriber_transaction_id', $payments->modelKeys())->pluck('subscriber_transaction_id')->all();
            $now = now();

            ClosingPayment::query()->insertOrIgnore($payments
                ->reject(fn (SubscriberTransaction $payment): bool => in_array($payment->id, $linked, true))
                ->map(fn (SubscriberTransaction $payment): array => [
                    'closing_id' => $this->id,
                    'subscriber_transaction_id' => $payment->id,
                    'match_status' => $payment->payment_method === PaymentMethod::Cash ? null : ClosingMatchStatus::Pending->value,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])
                ->values()
                ->all());
        });

        $this->unsetRelation('lines');
    }

    /**
     * The cash the drawer should hold at the end of the day: the cash it
     * started with, plus the day's cash payments, less the cash handed over
     * to the company during the day. There are no cash expenses or refunds
     * in the system yet, so none are taken off.
     *
     * @return array{opening: int, receipts: int, expenses: int, handedOver: int, expected: int, counted: int|null, difference: int|null}
     */
    public function cashFigures(): array
    {
        $opening = $this->opening_cash !== null ? self::cents($this->opening_cash) : $this->openingCashInCents();
        $receipts = $this->cashLines()->sum(fn (ClosingPayment $line): int => self::cents($line->payment->amount) * -1);
        $handedOver = self::cents((string) $this->transfersSentDuring($this->period_start, $this->period_start)->sum('amount'));
        $expected = $opening + $receipts - $handedOver;
        $counted = $this->counted_cash === null ? null : self::cents($this->counted_cash);

        return [
            'opening' => $opening,
            'receipts' => $receipts,
            'expenses' => 0,
            'handedOver' => $handedOver,
            'expected' => $expected,
            'counted' => $counted,
            'difference' => $counted === null ? null : $counted - $expected,
        ];
    }

    /**
     * What the branch's last earlier closing counted, less the cash handed
     * over between that day and this one. Nothing before the first closing.
     */
    private function openingCashInCents(): int
    {
        $previous = static::query()
            ->where('type', ClosingType::Daily)
            ->where('branch_id', $this->branch_id)
            ->whereDate('period_start', '<', $this->period_start->toDateString())
            ->orderByDesc('period_start')
            ->first();

        if ($previous === null || $previous->counted_cash === null) {
            return 0;
        }

        $daysBetween = $previous->period_start->addDay();
        $handedOver = $daysBetween->lessThan($this->period_start)
            ? (string) $this->transfersSentDuring($daysBetween, $this->period_start->subDay())->sum('amount')
            : '0';

        return self::cents($previous->counted_cash) - self::cents($handedOver);
    }

    /**
     * @return Builder<CashTransfer>
     */
    private function transfersSentDuring(CarbonInterface $first, CarbonInterface $last): Builder
    {
        [$from, $until] = ClosingPeriods::utcRange($first, $last);

        return CashTransfer::query()
            ->where('branch_id', $this->branch_id)
            ->where('sent_at', '>=', $from)
            ->where('sent_at', '<', $until);
    }

    /**
     * The closing's lines, each with its payment, oldest first.
     *
     * @return Collection<int, ClosingPayment>
     */
    public function paymentLines(): Collection
    {
        $this->loadMissing(['lines.payment.subscriber.meterBox', 'lines.payment.recordedBy']);

        return $this->lines->sortBy(fn (ClosingPayment $line) => [$line->payment->created_at, $line->payment->id])->values();
    }

    /**
     * @return Collection<int, ClosingPayment>
     */
    public function cashLines(): Collection
    {
        return $this->paymentLines()->filter(fn (ClosingPayment $line): bool => $line->match_status === null)->values();
    }

    /**
     * What the closing counts as collected: every line but the transfers
     * marked unconfirmed, which wait outside the total.
     */
    public function confirmedTotalInCents(): int
    {
        return $this->paymentLines()
            ->reject(fn (ClosingPayment $line): bool => $line->match_status === ClosingMatchStatus::Unconfirmed)
            ->sum(fn (ClosingPayment $line): int => self::cents($line->payment->amount) * -1);
    }

    /**
     * Record the cash count: how many of each note and coin, and why the
     * count differs from the expected cash when it does.
     *
     * @param  array<string, int>  $denominations
     */
    public function recordCount(User $actor, array $denominations, ?ClosingDifferenceReason $reason, ?string $notes): void
    {
        $this->ensureEditable();
        $counted = collect($denominations)->sum(fn (int $count, string|int $value): int => (int) $value * $count);

        $this->update([
            'denominations' => $denominations,
            'counted_cash' => number_format($counted, 2, '.', ''),
            'difference_reason' => $reason,
            'difference_notes' => $notes,
            'prepared_by' => $actor->id,
        ]);

        $figures = $this->cashFigures();
        $this->record($actor, 'counted', sprintf(
            'عُدّ النقد: %s ₪ (المتوقع %s ₪)%s',
            self::money($figures['counted']),
            self::money($figures['expected']),
            $figures['difference'] !== 0 && $notes ? " — {$notes}" : '',
        ));
    }

    /**
     * Mark a transfer as found in the receiving account (matched), as not
     * found (unconfirmed, kept outside the total until it is), or back to
     * waiting.
     */
    public function matchLine(User $actor, ClosingPayment $line, ClosingMatchStatus $status): void
    {
        $this->ensureEditable();

        if ($line->closing_id !== $this->id || $line->match_status === null) {
            throw ValidationException::withMessages(['line' => 'هذه الدفعة نقدية وتُطابق بعدّ الصندوق.']);
        }

        $line->update([
            'match_status' => $status,
            'matched_by' => $status === ClosingMatchStatus::Pending ? null : $actor->id,
            'matched_at' => $status === ClosingMatchStatus::Pending ? null : now(),
        ]);

        if ($status === ClosingMatchStatus::Unconfirmed) {
            $this->record($actor, 'unconfirmed', sprintf('نُقلت الدفعة #%d إلى الإيصالات المعلّقة: لم تظهر في حركة %s', $line->subscriber_transaction_id, $line->payment->bank_name));
        }
    }

    /**
     * What still stops the branch from sending the closing for review.
     *
     * @return array<int, string>
     */
    public function submissionBlockers(): array
    {
        $blockers = [];

        if (! ClosingPeriods::hasEnded($this->period_end)) {
            $blockers[] = 'اليوم لم ينتهِ بعد؛ يُرسل الكشف بعد وقت القطع.';
        }

        $figures = $this->cashFigures();

        if ($figures['counted'] === null) {
            $blockers[] = 'عُدّ النقد في الصندوق أولًا.';
        } elseif ($figures['difference'] !== 0 && ($this->difference_reason === null || blank($this->difference_notes))) {
            $blockers[] = 'اذكر سبب الفرق بين النقد المعدود والمتوقع.';
        }

        if ($this->paymentLines()->contains(fn (ClosingPayment $line): bool => $line->match_status === ClosingMatchStatus::Pending)) {
            $blockers[] = 'طابِق كل تحويل مع حركة الحساب المستلم، أو انقله إلى المعلّقة.';
        }

        return $blockers;
    }

    public function submit(User $actor): void
    {
        $this->ensureEditable();
        $this->syncPayments();

        if ($blockers = $this->submissionBlockers()) {
            throw ValidationException::withMessages(['closing' => $blockers[0]]);
        }

        $resubmitted = $this->status === ClosingStatus::Returned;
        $this->update([
            'status' => ClosingStatus::Submitted,
            'opening_cash' => self::money($this->cashFigures()['opening']),
            'prepared_by' => $actor->id,
            'submitted_at' => now(),
        ]);
        $this->record($actor, 'submitted', $resubmitted ? 'أُعيد إرسال الكشف للتدقيق بعد التصحيح' : 'أُرسل الكشف للتدقيق');
    }

    /**
     * Send the closing back to the branch with the reason it must fix.
     */
    public function returnForCorrection(User $actor, string $reason): void
    {
        $this->ensureSubmitted();
        $this->update([
            'status' => ClosingStatus::Returned,
            'opening_cash' => null,
            'reviewed_by' => $actor->id,
            'reviewed_at' => now(),
            'return_reason' => $reason,
        ]);
        $this->record($actor, 'returned', "أُعيد الكشف للتصحيح: {$reason}");
    }

    /**
     * Approve and lock the closing. Whoever prepared it may not approve it.
     */
    public function approve(User $actor): void
    {
        $this->ensureSubmitted();

        if ($this->prepared_by === $actor->id) {
            throw ValidationException::withMessages(['closing' => 'لا يمكنك اعتماد كشف أعددته بنفسك؛ يعتمده مدقق آخر.']);
        }

        $this->update([
            'status' => ClosingStatus::Approved,
            'reviewed_by' => $actor->id,
            'reviewed_at' => now(),
            'return_reason' => null,
        ]);
        $this->record($actor, 'approved', 'اعتُمد الكشف وقُفل من التعديل المباشر');
    }

    /**
     * Note what happened to the closing: `$actor` is null for the system.
     */
    public function record(?User $actor, string $action, string $description): ClosingEvent
    {
        return $this->events()->create(['user_id' => $actor?->id, 'action' => $action, 'description' => $description]);
    }

    private function ensureEditable(): void
    {
        if (! $this->status->isEditable()) {
            throw ValidationException::withMessages(['closing' => 'الكشف أُرسل للتدقيق أو اعتُمد، فلا يُعدَّل مباشرة.']);
        }
    }

    private function ensureSubmitted(): void
    {
        if ($this->status !== ClosingStatus::Submitted) {
            throw ValidationException::withMessages(['closing' => 'الكشف ليس بانتظار التدقيق.']);
        }
    }

    public static function cents(string|float|int|null $amount): int
    {
        return (int) round((float) $amount * 100);
    }

    public static function money(int $cents): string
    {
        return number_format($cents / 100, 2, '.', '');
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(ClosingPayment::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(ClosingEvent::class);
    }

    public function transfers(): HasMany
    {
        return $this->hasMany(CashTransfer::class);
    }

    public function preparedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'prepared_by');
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
