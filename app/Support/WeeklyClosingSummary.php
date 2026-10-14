<?php

namespace App\Support;

use App\Enums\CashBoxType;
use App\Enums\ClosingStatus;
use App\Models\CashBox;
use App\Models\Closing;
use App\Models\ClosingConfirmation;
use App\Models\SubscriptionTransaction;
use Illuminate\Support\Collection;

/**
 * A weekly closing as the weekly closing page shows it: the boxes it holds
 * (as frozen when the branch closed it, else as they stand now), their sums
 * by type and by collector, and the step the week has reached on its way
 * to audit.
 */
class WeeklyClosingSummary
{
    /** The steps of a week, in order, the page's progress bar shows. */
    public const STEPS = ['review', 'lock', 'confirm', 'submit', 'audit'];

    /**
     * The step the week waits on, from `STEPS`, or `done` once audit
     * accepted it.
     */
    public function step(Closing $closing): string
    {
        return match (true) {
            $closing->status === ClosingStatus::Approved => 'done',
            in_array($closing->status, [ClosingStatus::Submitted, ClosingStatus::Returned], true) => 'audit',
            $closing->status === ClosingStatus::Locked => $closing->confirmations->contains(fn (ClosingConfirmation $confirmation): bool => $confirmation->confirmed_at === null) ? 'confirm' : 'submit',
            $closing->coverage_until->lessThanOrEqualTo(now()) => 'lock',
            default => 'review',
        };
    }

    /**
     * The week's boxes that hold entries: its own and those older ones it
     * settled, each marked `in` when it came from an earlier week and `out`
     * when it is carried to the next one.
     *
     * @return list<array<string, mixed>>
     */
    public function boxes(Closing $closing): array
    {
        if ($closing->submitted_snapshot) {
            $snapshot = $closing->submitted_snapshot;
            $carriedOut = array_column($snapshot['carriedOut']['boxes'] ?? [], 'id');

            return collect($snapshot['boxes'] ?? [])->map(fn (array $box): array => $this->row($box, in_array($box['id'], $carriedOut, true) ? 'out' : null))
                ->concat(collect($snapshot['carriedIn'] ?? [])->map(fn (array $box): array => $this->row($box, 'in')))
                ->filter(fn (array $box): bool => $box['entries'] + $box['cancelled'] > 0)->unique('id')->values()->all();
        }
        $periodIds = Closing::query()->where('branch_id', $closing->branch_id)->where('coverage_from', $closing->coverage_from)->pluck('id');
        $ended = $closing->coverage_until->lessThanOrEqualTo(now());

        return CashBox::query()->where('branch_id', $closing->branch_id)
            ->where(fn ($query) => $query->whereIn('closing_id', $periodIds)->orWhere('received_in_closing_id', $closing->id))
            ->whereHas('payments')->with(['user:id,name', 'payments:id,cash_box_id,subscription_transaction_id,currency,amount,method,status', 'payments.transaction:id,status'])
            ->orderBy('id')->get()
            ->map(fn (CashBox $box): array => $this->row($box->toArray(), ! $periodIds->contains($box->closing_id) ? 'in' : ($ended && $box->status !== 'received' ? 'out' : null)))
            ->all();
    }

    /**
     * @param  array<string, mixed>  $box
     * @return array<string, mixed>
     */
    private function row(array $box, ?string $carried): array
    {
        $payments = collect($box['payments'] ?? []);
        $active = $payments->filter(fn (array $entry): bool => ($entry['transaction']['status'] ?? SubscriptionTransaction::STATUS_ACTIVE) === SubscriptionTransaction::STATUS_ACTIVE);

        return [
            'id' => $box['id'],
            'number' => $box['number'],
            'type' => $box['type'] ?? CashBoxType::Cash->value,
            'status' => $box['status'],
            'userId' => $box['user_id'] ?? null,
            'userName' => $box['user']['name'] ?? null,
            'openedAt' => $box['opened_at'] ?? null,
            'closedAt' => $box['closed_at'] ?? null,
            'carried' => $carried,
            'entries' => $active->count(),
            'cancelled' => $payments->count() - $active->count(),
            'amounts' => $this->amounts($active),
            'url' => route('payments.cash-boxes.show', $box['id']),
        ];
    }

    /**
     * The week's totals, by type of box and by collector.
     *
     * @param  list<array<string, mixed>>  $boxes
     * @return array{boxes: int, entries: int, collectors: int, amounts: array<string, string>, byType: list<array<string, mixed>>, byCollector: list<array<string, mixed>>}
     */
    public function totals(array $boxes): array
    {
        $rows = collect($boxes);
        $sum = fn (Collection $group): array => $this->addAmounts($group->pluck('amounts'));

        return [
            'boxes' => $rows->count(),
            'entries' => $rows->sum('entries'),
            'collectors' => $rows->pluck('userId')->filter()->unique()->count(),
            'amounts' => $sum($rows),
            'byType' => collect(CashBoxType::cases())->map(fn (CashBoxType $type): array => [
                'type' => $type->value,
                'boxes' => $rows->where('type', $type->value)->count(),
                'entries' => $rows->where('type', $type->value)->sum('entries'),
                'amounts' => $sum($rows->where('type', $type->value)),
            ])->all(),
            'byCollector' => $rows->groupBy(fn (array $box): string => (string) ($box['userId'] ?? 'none'))->map(fn (Collection $group): array => [
                'userId' => $group->first()['userId'],
                'name' => $group->first()['userName'] ?? '—',
                'boxes' => $group->count(),
                'entries' => $group->sum('entries'),
                'amounts' => $sum($group),
                'types' => $group->groupBy('type')->map(fn (Collection $typed): array => ['boxes' => $typed->count(), 'amounts' => $sum($typed)])->all(),
            ])->sortBy('name')->values()->all(),
        ];
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $entries
     * @return array<string, string>
     */
    private function amounts(Collection $entries): array
    {
        return collect(BranchClosingWorkflow::CURRENCIES)->mapWithKeys(fn (string $currency): array => [
            $currency => Closing::money($entries->where('currency', $currency)->sum(fn (array $entry): int => Closing::cents($entry['amount']))),
        ])->all();
    }

    /**
     * @param  Collection<int, array<string, string>>  $amounts
     * @return array<string, string>
     */
    private function addAmounts(Collection $amounts): array
    {
        return collect(BranchClosingWorkflow::CURRENCIES)->mapWithKeys(fn (string $currency): array => [
            $currency => Closing::money($amounts->sum(fn (array $sums): int => Closing::cents($sums[$currency] ?? 0))),
        ])->all();
    }
}
