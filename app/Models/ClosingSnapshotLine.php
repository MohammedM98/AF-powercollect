<?php

namespace App\Models;

use Database\Factories\ClosingSnapshotLineFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Validation\ValidationException;

#[Fillable(['closing_id', 'subscription_transaction_id', 'classification', 'ledger_effect', 'collection_effect', 'payment_method', 'channel', 'details'])]
class ClosingSnapshotLine extends Model
{
    /** @use HasFactory<ClosingSnapshotLineFactory> */
    use HasFactory;

    public const UPDATED_AT = null;

    protected function casts(): array
    {
        return ['ledger_effect' => 'decimal:2', 'collection_effect' => 'decimal:2', 'details' => 'array'];
    }

    protected static function booted(): void
    {
        static::creating(function (self $line): void {
            $closing = $line->closing;
            $detail = collect($closing?->snapshot['report']['lines'] ?? [])->firstWhere('transactionId', $line->subscription_transaction_id);
            if ($detail === null || $detail != $line->details
                || $line->ledger_effect !== $detail['ledgerEffect'] || $line->collection_effect !== $detail['collectionEffect']
                || $line->classification !== $detail['classification'] || $line->payment_method !== $detail['method'] || $line->channel !== $detail['channel']) {
                throw ValidationException::withMessages(['period' => 'لا يمكن إضافة حركة خارج لقطة الإغلاق المثبتة.']);
            }
        });
        $reject = function (): never {
            throw ValidationException::withMessages(['period' => 'تفاصيل لقطة الإغلاق ثابتة ولا يمكن تعديلها أو حذفها.']);
        };
        static::updating($reject);
        static::deleting($reject);
    }

    public function closing(): BelongsTo
    {
        return $this->belongsTo(Closing::class);
    }
}
