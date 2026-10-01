<?php

namespace App\Http\Controllers;

use App\Enums\CashTransferMethod;
use App\Enums\CashTransferStatus;
use App\Enums\PermissionKey;
use App\Enums\UserRole;
use App\Models\CashTransfer;
use App\Models\Closing;
use App\Models\User;
use App\Notifications\ActionCompleted;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Handing a branch's counted cash over to the company: recorded with its
 * proof once the daily closing is approved, in transit until the recipient
 * confirms it arrived. An internal transfer, never a new collection.
 */
class CashTransferController extends Controller
{
    public function store(Request $request, Closing $closing): RedirectResponse
    {
        $this->authorize('handOver', $closing);
        $actor = $request->user();
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'decimal:0,2', 'gt:0', 'max:1000000'],
            'method' => ['required', Rule::enum(CashTransferMethod::class)],
            'recipient_id' => ['required', 'integer', Rule::exists('users', 'id')->where('is_active', true)],
            'sent_at' => ['required', 'date'],
            'proof' => ['required', 'image', 'max:8192'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ], [
            'proof.required' => 'أرفق صورة إثبات التسليم.',
        ]);
        // The form's date and time are business time.
        $sentAt = Carbon::parse($validated['sent_at'], config('app.business_timezone'))->utc();

        if ($sentAt->isFuture()) {
            throw ValidationException::withMessages(['sent_at' => 'لا يمكن تسجيل تسليم بوقت لاحق.']);
        }

        $recipient = User::query()
            ->whereKey($validated['recipient_id'])
            ->whereKeyNot($actor->id)
            ->where(fn (Builder $query) => $query
                ->where('role', UserRole::SuperAdmin)
                ->orWhereHas('permissions', fn (Builder $permission) => $permission->where('key', PermissionKey::AuditClosings->value)))
            ->first();

        if ($recipient === null) {
            throw ValidationException::withMessages(['recipient_id' => 'اختر المدير العام أو أحد مدققي الكشوف لاستلام النقد.']);
        }

        $path = $request->file('proof')->store('cash-transfers', 'local');

        try {
            $this->recordHandover($closing, $actor, $recipient, $validated, $path, $sentAt);
        } catch (ValidationException $exception) {
            Storage::disk('local')->delete($path);

            throw $exception;
        }

        $actor->notify(new ActionCompleted('cash-handed-over', "الكشف {$closing->number}"));

        return back()->with('status', 'cash-handed-over');
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function recordHandover(Closing $closing, User $actor, User $recipient, array $validated, string $path, Carbon $sentAt): void
    {
        DB::transaction(function () use ($closing, $actor, $recipient, $validated, $path, $sentAt): void {
            $closing = Closing::query()->lockForUpdate()->findOrFail($closing->id);
            $sent = Closing::cents((string) $closing->transfers()->sum('amount'));
            $remaining = Closing::cents($closing->counted_cash) - $sent;

            if (Closing::cents($validated['amount']) > $remaining) {
                throw ValidationException::withMessages(['amount' => 'المبلغ أكبر من النقد المعدود الذي لم يُسلَّم بعد ('.Closing::money(max(0, $remaining)).' ₪).']);
            }

            $transfer = $closing->transfers()->create([
                'branch_id' => $closing->branch_id,
                'amount' => $validated['amount'],
                'method' => $validated['method'],
                'sent_by' => $actor->id,
                'recipient_id' => $recipient->id,
                'sent_at' => $sentAt,
                'proof_path' => $path,
                'notes' => $validated['notes'] ?? null,
                'status' => CashTransferStatus::InTransit,
            ]);
            $closing->record($actor, 'handed_over', sprintf('سُلّم %s ₪ نقدًا إلى %s (%s) وهي قيد النقل', $transfer->amount, $recipient->name, __($transfer->method->label())));
        });
    }

    public function receive(Request $request, CashTransfer $transfer): RedirectResponse
    {
        $this->authorize('confirmReceipt', $transfer);

        DB::transaction(function () use ($request, $transfer): void {
            $transfer = CashTransfer::query()->lockForUpdate()->findOrFail($transfer->id);

            if ($transfer->status !== CashTransferStatus::InTransit) {
                return;
            }

            $transfer->update(['status' => CashTransferStatus::Received, 'received_by' => $request->user()->id, 'received_at' => now()]);
            $transfer->closing->record($request->user(), 'received', sprintf('أُكّد استلام %s ₪ في خزينة الشركة', $transfer->amount));
        });

        $request->user()->notify(new ActionCompleted('cash-received', "الكشف {$transfer->closing->number}"));

        return back()->with('status', 'cash-received');
    }

    public function proof(Request $request, CashTransfer $transfer): StreamedResponse
    {
        $this->authorize('view', $transfer);
        abort_unless(Storage::disk('local')->exists($transfer->proof_path), 404);

        return Storage::disk('local')->response($transfer->proof_path);
    }
}
