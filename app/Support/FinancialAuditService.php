<?php

namespace App\Support;

use App\Enums\CashTransferStatus;
use App\Enums\ClosingStatus;
use App\Enums\ClosingType;
use App\Models\Branch;
use App\Models\CashTransfer;
use App\Models\Closing;
use App\Models\FinancialAuditEvent;
use App\Models\FinancialAuditLine;
use App\Models\FinancialAuditStatement;
use App\Models\SubscriptionTransaction;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class FinancialAuditService
{
    public function __construct(private WeeklyClosingService $weekly) {}

    public function submit(User $actor, Branch $branch, string $type, string $date): FinancialAuditStatement
    {
        Gate::forUser($actor)->authorize('submit', [FinancialAuditStatement::class, $branch]);

        return DB::transaction(function () use ($actor, $branch, $type, $date): FinancialAuditStatement {
            $this->weekly->lock();
            $sourceClosing = null;
            if ($type === 'weekly') {
                $period = $this->weekly->forDate($date);
                $sourceClosing = $period->closing;
                if (! $period->status->isClosed() || $sourceClosing?->snapshot === null) {
                    throw ValidationException::withMessages(['audit' => 'أقفل الفترة الأسبوعية أولاً لتُرسل نسخة ثابتة إلى التدقيق.']);
                }
                $first = $period->period_start;
                $last = $period->period_end;
                $startsAt = $period->starts_at;
                $endsAt = $period->cutoff_at;
                $details = collect($sourceClosing->snapshot['report']['lines'])->where('branchId', $branch->id)->values()->all();
                $report = $this->weekly->summarize($details);
            } else {
                [$first, $last] = $type === 'monthly' ? ClosingPeriods::month($date) : [ClosingPeriods::date($date), ClosingPeriods::date($date)];
                [$startsAt, $endsAt] = ClosingPeriods::utcRange($first, $last);
                if (now()->lessThan($endsAt)) {
                    throw ValidationException::withMessages(['audit' => 'الفترة لم تنتهِ بعد.']);
                }
                $report = $this->weekly->reportBetween($startsAt, $endsAt, [$branch->id]);
            }
            if (FinancialAuditStatement::query()->where('branch_id', $branch->id)->where('type', $type)
                ->whereDate('period_start', $first)->whereDate('period_end', $last)->exists()) {
                throw ValidationException::withMessages(['audit' => 'أُرسل كشف هذا الفرع لهذه الفترة من قبل.']);
            }
            $reviewLines = collect($report['lines'])->filter(fn (array $line): bool => $line['classification'] !== 'charge'
                && (Closing::cents($line['collectionEffect']) !== 0 || in_array($line['classification'], ['correction', 'reversal'], true)));
            $days = $reviewLines->map(fn (array $line): string => ClosingPeriods::dayOf($line['recordedAt']))->unique();
            if ($type === 'daily') {
                $days = collect([$first->toDateString()]);
            }
            $dailyClosings = $days->isEmpty() ? collect() : Closing::query()->where('branch_id', $branch->id)->where('type', ClosingType::Daily)
                ->where(function (Builder $query) use ($days): void {
                    foreach ($days as $day) {
                        $query->orWhereDate('period_start', $day);
                    }
                })->lockForUpdate()->get();
            foreach ($days as $day) {
                if ($dailyClosings->first(fn (Closing $closing): bool => $closing->period_start->toDateString() === $day)?->status !== ClosingStatus::Approved) {
                    throw ValidationException::withMessages(['audit' => "اعتمد إقفال الفرع ليوم {$day} قبل إرسال الكشف."]);
                }
            }
            if ($type === 'daily') {
                $sourceClosing = $dailyClosings->first();
            }
            $transfers = CashTransfer::query()->where('branch_id', $branch->id)->where('sent_at', '>=', $startsAt)->where('sent_at', '<', $endsAt)->get();
            $latestDaily = $dailyClosings->sortByDesc('period_start')->first();
            $retained = $latestDaily ? max(0, Closing::cents($latestDaily->counted_cash ?? '0') - Closing::cents((string) CashTransfer::query()->where('closing_id', $latestDaily->id)->sum('amount'))) : 0;
            $statement = FinancialAuditStatement::create([
                'number' => strtoupper(substr($type, 0, 1)).'-A-'.$branch->id.'-'.$first->toDateString().'-'.$last->toDateString(),
                'branch_id' => $branch->id, 'closing_id' => $sourceClosing?->id, 'type' => $type,
                'period_start' => $first, 'period_end' => $last, 'starts_at' => $startsAt, 'ends_at' => $endsAt,
                'status' => 'pending', 'submitted_by' => $actor->id, 'submitted_at' => now(),
                'snapshot' => ['branchName' => $branch->name, 'report' => $report, 'dailyClosingIds' => $dailyClosings->pluck('id')->all(),
                    'inTransit' => Closing::money($transfers->where('status', CashTransferStatus::InTransit)->sum(fn (CashTransfer $transfer): int => Closing::cents($transfer->amount))),
                    'received' => Closing::money($transfers->where('status', CashTransferStatus::Received)->sum(fn (CashTransfer $transfer): int => Closing::cents($transfer->amount))),
                    'retained' => Closing::money($retained), 'capturedAt' => now()->toIso8601String()],
            ]);
            foreach ($reviewLines as $detail) {
                $statement->lines()->create(['subscription_transaction_id' => $detail['transactionId'], 'details' => $detail, 'status' => 'pending']);
            }
            $this->event($statement, $actor, 'submitted', 'أرسل الفرع نسخة ثابتة من كشفه إلى التدقيق المركزي.');

            return $statement;
        }, 3);
    }

    public function review(User $actor, FinancialAuditStatement $statement, FinancialAuditLine $line, string $action, ?string $notes): void
    {
        DB::transaction(function () use ($actor, $statement, $line, $action, $notes): void {
            $statement = FinancialAuditStatement::query()->lockForUpdate()->findOrFail($statement->id);
            Gate::forUser($actor)->authorize('review', $statement);
            $line = $statement->lines()->lockForUpdate()->findOrFail($line->id);
            if ($action === 'confirm' && ! in_array($line->status, ['pending', 'responded'], true)) {
                throw ValidationException::withMessages(['audit' => 'الحركة مؤكدة بالفعل أو تحتاج رد الفرع قبل إعادة التحقق.']);
            }
            if ($action === 'return' && $line->status === 'returned') {
                throw ValidationException::withMessages(['audit' => 'الحركة معادة بالفعل وبانتظار رد الفرع.']);
            }
            if ($action === 'return' && trim($notes ?? '') === '') {
                throw ValidationException::withMessages(['notes' => 'اكتب سبب إرجاع الحركة.']);
            }
            $line->update(['status' => $action === 'confirm' ? 'confirmed' : 'returned', 'review_notes' => $notes,
                'reviewed_by' => $actor->id, 'reviewed_at' => now(),
                ...($action === 'return' ? ['response' => null, 'correction_transaction_id' => null] : [])]);
            $this->event($statement, $actor, $action === 'confirm' ? 'confirmed' : 'returned', $notes, $line);
            $statement->update(['status' => $statement->lines()->where('status', 'returned')->exists() ? 'returned' : 'under_audit']);
        }, 3);
    }

    public function respond(User $actor, FinancialAuditStatement $statement, FinancialAuditLine $line, string $response, ?int $correctionId): void
    {
        DB::transaction(function () use ($actor, $statement, $line, $response, $correctionId): void {
            $statement = FinancialAuditStatement::query()->lockForUpdate()->findOrFail($statement->id);
            Gate::forUser($actor)->authorize('respond', $statement);
            $line = $statement->lines()->lockForUpdate()->findOrFail($line->id);
            if ($line->status !== 'returned') {
                throw ValidationException::withMessages(['audit' => 'يمكن الرد على الحركات المعادة فقط.']);
            }
            if ($correctionId !== null) {
                $correction = SubscriptionTransaction::query()->find($correctionId);
                $related = false;
                if ($correction !== null && $correction->subscription_id === $line->details['subscriptionId']
                    && ($correction->adjustment_type !== null || $correction->type === SubscriptionTransaction::TYPE_REFUND)) {
                    $cursor = $correction;
                    $visited = [];
                    while ($cursor?->reference_transaction_id !== null && ! in_array($cursor->id, $visited, true)) {
                        $visited[] = $cursor->id;
                        if ($cursor->reference_transaction_id === $line->subscription_transaction_id) {
                            $related = true;
                            break;
                        }
                        $cursor = $cursor->referenceTransaction;
                    }
                }
                if (! $related) {
                    throw ValidationException::withMessages(['correction_transaction_id' => 'اختر تصحيحاً مرتبطاً بالحركة الأصلية نفسها.']);
                }
            }
            $line->update(['status' => 'responded', 'response' => $response, 'correction_transaction_id' => $correctionId]);
            $this->event($statement, $actor, 'responded', $response, $line, $correctionId);
            $statement->update(['status' => $statement->lines()->where('status', 'returned')->exists() ? 'returned' : 'under_audit']);
        }, 3);
    }

    public function approve(User $actor, FinancialAuditStatement $statement, ?string $notes): void
    {
        DB::transaction(function () use ($actor, $statement, $notes): void {
            $statement = FinancialAuditStatement::query()->lockForUpdate()->findOrFail($statement->id);
            Gate::forUser($actor)->authorize('review', $statement);
            if ($statement->lines()->where('status', '!=', 'confirmed')->exists()) {
                throw ValidationException::withMessages(['audit' => 'أكد جميع الحركات وعالج الحركات المعادة قبل اعتماد التدقيق.']);
            }
            $statement->update(['status' => 'audited', 'reviewed_by' => $actor->id, 'reviewed_at' => now()]);
            $this->event($statement, $actor, 'audited', $notes);
        }, 3);
    }

    private function event(FinancialAuditStatement $statement, User $actor, string $action, ?string $notes, ?FinancialAuditLine $line = null, ?int $correctionId = null): void
    {
        FinancialAuditEvent::create(['financial_audit_statement_id' => $statement->id, 'financial_audit_line_id' => $line?->id,
            'user_id' => $actor->id, 'action' => $action, 'notes' => $notes, 'correction_transaction_id' => $correctionId]);
    }
}
