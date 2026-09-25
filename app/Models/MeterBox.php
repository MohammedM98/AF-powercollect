<?php

namespace App\Models;

use App\Models\Concerns\BelongsToBranch;
use Database\Factories\MeterBoxFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'box_number', 'branch_id', 'sub_area_id', 'location'])]
class MeterBox extends Model
{
    /** @use HasFactory<MeterBoxFactory> */
    use BelongsToBranch, HasFactory;

    public function subArea(): BelongsTo
    {
        return $this->belongsTo(SubArea::class);
    }

    public function subscribers(): HasMany
    {
        return $this->hasMany(Subscriber::class);
    }
}
