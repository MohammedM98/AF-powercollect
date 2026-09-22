<?php

namespace App\Models;

use Database\Factories\AreaFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'governorate_id'])]
class Area extends Model
{
    /** @use HasFactory<AreaFactory> */
    use HasFactory;

    public function governorate(): BelongsTo
    {
        return $this->belongsTo(Governorate::class);
    }

    public function meterBoxes(): HasMany
    {
        return $this->hasMany(MeterBox::class);
    }

    public function subAreas(): HasMany
    {
        return $this->hasMany(SubArea::class);
    }
}
