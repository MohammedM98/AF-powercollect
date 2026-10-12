<?php

namespace App\Http\Controllers\Mobile;

use App\Http\Controllers\Controller;
use App\Http\Requests\BranchClosingActionRequest;
use App\Models\AuditNote;
use App\Models\CashBox;
use App\Models\CashBoxSync;
use App\Models\ClosingSetting;
use App\Models\CollectorDebt;
use App\Models\Subscription;
use App\Support\BranchClosingWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MobileCashBoxController extends Controller
{
    public function __construct(private BranchClosingWorkflow $workflow) {}

    public function index(Request $request): JsonResponse
    {
        $actor = $request->user();
        $this->authorize('viewOwnCashBoxes', Subscription::class);
        abort_unless($actor->branch_id, 403);
        $started = ClosingSetting::ownFor($actor->branch_id)?->workflow_started_at !== null;
        if ($started) {
            $this->workflow->refresh($actor->branch_id);
        }
        $boxes = CashBox::query()->where('branch_id', $actor->branch_id)->where('user_id', $actor->id)->where('kind', '!=', 'direct')->with(['payments.transaction:id,subscription_id,reference_number,bank_name,sender_bank_name,voucher_number,notes,status', 'payments.transaction.subscription:id,full_name,subscription_name,account_number'])->latest('id')->limit(100)->get()
            ->map(function (CashBox $box): array {
                $row = $box->toArray();
                $row['stage'] = $box->stage();
                $row['totals'] = $box->totals();
                if (! $box->collector_counts) {
                    $row['expected_counts'] = null;
                }

                return $row;
            });

        return response()->json(['started' => $started, 'branch_id' => $actor->branch_id, 'boxes' => $boxes, 'debts' => CollectorDebt::query()->where('user_id', $actor->id)->where('branch_id', $actor->branch_id)->where('remaining', '>', 0)->get(), 'notes' => AuditNote::query()->where('assigned_to', $actor->id)->where('status', 'with_collector')->whereHas('closing', fn ($query) => $query->where('branch_id', $actor->branch_id))->get()]);
    }

    public function action(BranchClosingActionRequest $request, string $action, int $record): JsonResponse
    {
        $actor = $request->user();
        abort_unless($request->integer('branch_id') === $actor->branch_id, 404);
        $this->authorize('viewOwnCashBoxes', Subscription::class);
        abort_unless(in_array($action, ['close', 'collector-count', 'confirm'], true), 403);
        $this->workflow->locked($actor->branch_id, function () use ($request, $action, $record, $actor): void {
            $this->workflow->refresh($actor->branch_id);
            $box = CashBox::query()->where('branch_id', $actor->branch_id)->where('user_id', $actor->id)->findOrFail($record);
            match ($action) {
                'close' => $this->workflow->closeByCollector($box, $actor, $request->validated()),
                'collector-count' => $this->workflow->countCollector($box, $actor, $request->validated()),
                'confirm' => $this->workflow->confirmBox($box, $actor),
            };
        });

        return response()->json(['status' => 'saved']);
    }

    public function reply(Request $request, int $note): JsonResponse
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:3000']]);
        $actor = $request->user();
        $this->workflow->locked($actor->branch_id, function () use ($actor, $note, $data): void {
            $item = AuditNote::query()->where('assigned_to', $actor->id)->where('status', 'with_collector')->whereHas('closing', fn ($query) => $query->where('branch_id', $actor->branch_id))->findOrFail($note);
            $item->replies()->create(['user_id' => $actor->id, 'kind' => 'collector_response', 'body' => $data['body']]);
            $item->update(['status' => 'collector_replied']);
        });

        return response()->json(['status' => 'saved']);
    }

    public function sync(Request $request): JsonResponse
    {
        $data = $request->validate(['pending_payments' => ['required', 'integer', 'between:0,100000']]);
        $actor = $request->user();
        abort_unless($actor->branch_id, 403);
        CashBoxSync::query()->updateOrCreate(['branch_id' => $actor->branch_id, 'user_id' => $actor->id], ['synced_at' => now(), 'pending_payments' => $data['pending_payments']]);

        return response()->json(['status' => 'synced']);
    }
}
