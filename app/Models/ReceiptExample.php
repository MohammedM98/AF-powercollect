<?php

namespace App\Models;

use Database\Factories\ReceiptExampleFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

#[Fillable(['provider_id', 'uploaded_by', 'title', 'layout', 'purpose', 'original_file_path', 'file_hash', 'verified_fields', 'verification_version'])]
#[Hidden(['original_file_path', 'verified_fields'])]
class ReceiptExample extends Model
{
    /** @use HasFactory<ReceiptExampleFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return ['verified_fields' => 'encrypted:array', 'verification_version' => 'integer'];
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(PaymentProvider::class, 'provider_id');
    }

    public function uploadedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function runs(): HasMany
    {
        return $this->hasMany(ReceiptExampleRun::class);
    }

    public function latestRun(): HasOne
    {
        return $this->hasOne(ReceiptExampleRun::class)->latestOfMany();
    }
}
