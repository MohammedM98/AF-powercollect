<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreBankTransferAuditRequest;
use App\Models\CashBoxPayment;
use App\Support\BankTransferAuditing;
use Illuminate\Http\RedirectResponse;

class BankTransferAuditController extends Controller
{
    public function store(StoreBankTransferAuditRequest $request, CashBoxPayment $entry, BankTransferAuditing $auditing): RedirectResponse
    {
        $auditing->record($entry, $request->user(), (string) $request->validated('bank_amount'), $request->validated('reason'));

        return back()->with('status', 'تم حفظ مراجعة الحوالة؛ يثبت أثرها المالي عند اعتماد الصندوق.');
    }
}
