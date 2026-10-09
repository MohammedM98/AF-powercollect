<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Validation\ValidationException;

#[Fillable(['financial_audit_statement_id', 'financial_audit_line_id', 'user_id', 'action', 'notes', 'correction_transaction_id'])]
class FinancialAuditEvent extends Model
{
    public const UPDATED_AT = null;

    protected static function booted(): void
    {
        $reject = function (): never {
            throw ValidationException::withMessages(['audit' => 'سجل إجراءات التدقيق ثابت ولا يمكن تعديله أو حذفه.']);
        };
        static::updating($reject);
        static::deleting($reject);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
