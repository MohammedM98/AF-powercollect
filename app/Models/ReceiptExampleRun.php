<?php

namespace App\Models;

use Database\Factories\ReceiptExampleRunFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['receipt_example_id', 'tested_by', 'verification_version', 'parser_version', 'mode', 'status', 'ocr_confidence', 'ocr_raw_response', 'extracted_fields', 'expected_fields', 'comparison', 'error', 'tested_at'])]
#[Hidden(['ocr_raw_response', 'extracted_fields', 'expected_fields', 'comparison'])]
class ReceiptExampleRun extends Model
{
    /** @use HasFactory<ReceiptExampleRunFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return ['verification_version' => 'integer', 'ocr_confidence' => 'float',
            'ocr_raw_response' => 'encrypted:array', 'extracted_fields' => 'encrypted:array',
            'expected_fields' => 'encrypted:array', 'comparison' => 'encrypted:array', 'tested_at' => 'immutable_datetime'];
    }

    public function receiptExample(): BelongsTo
    {
        return $this->belongsTo(ReceiptExample::class);
    }

    public function testedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'tested_by');
    }
}
