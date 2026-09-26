<?php

namespace App\Models;

use Database\Factories\TariffSegmentFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A customer segment within a tariff, such as mosques or schools under
 * Residential. It only groups subscribers; they still pay the tariff's rate.
 */
#[Fillable(['tariff_id', 'name'])]
class TariffSegment extends Model
{
    /** @use HasFactory<TariffSegmentFactory> */
    use HasFactory;

    public function tariff(): BelongsTo
    {
        return $this->belongsTo(Tariff::class);
    }

    public function subscribers(): HasMany
    {
        return $this->hasMany(Subscriber::class);
    }

    /**
     * The segment as shown to people, with its tariff's category first,
     * e.g. "منزلي — مساجد".
     */
    public function label(): string
    {
        return __($this->tariff->category->label()).' — '.$this->name;
    }
}
