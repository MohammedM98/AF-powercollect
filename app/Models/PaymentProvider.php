<?php

namespace App\Models;

use Database\Factories\PaymentProviderFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['code', 'name_en', 'name_ar', 'type', 'is_active'])]
class PaymentProvider extends Model
{
    /** @use HasFactory<PaymentProviderFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function receipts(): HasMany
    {
        return $this->hasMany(PaymentReceipt::class, 'provider_id');
    }
}
