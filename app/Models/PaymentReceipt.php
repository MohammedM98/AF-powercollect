<?php

namespace App\Models;

use Database\Factories\PaymentReceiptFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['payment_id', 'collector_id', 'provider_id', 'original_file_path',
    'file_hash', 'confirmed_file_hash', 'normalized_reference', 'ocr_status',
    'provider_confidence', 'ocr_raw_response', 'extracted_fields', 'confirmed_fields',
    'processed_at', 'confirmed_at'])]
#[Hidden(['original_file_path', 'ocr_raw_response', 'extracted_fields', 'confirmed_fields'])]
class PaymentReceipt extends Model
{
    /** @use HasFactory<PaymentReceiptFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return [
            'provider_confidence' => 'float',
            'ocr_raw_response' => 'encrypted:array',
            'extracted_fields' => 'encrypted:array',
            'confirmed_fields' => 'encrypted:array',
            'processed_at' => 'immutable_datetime',
            'confirmed_at' => 'immutable_datetime',
        ];
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(SubscriberTransaction::class, 'payment_id');
    }

    public function collector(): BelongsTo
    {
        return $this->belongsTo(User::class, 'collector_id');
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(PaymentProvider::class, 'provider_id');
    }
}
