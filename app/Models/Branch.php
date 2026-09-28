<?php

namespace App\Models;

use App\Support\DeletionBlocker;
use Database\Factories\BranchFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;

#[Fillable(['name', 'location', 'phone', 'is_active', 'governorate_id', 'area_id'])]
class Branch extends Model
{
    /** @use HasFactory<BranchFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function governorate(): BelongsTo
    {
        return $this->belongsTo(Governorate::class);
    }

    public function area(): BelongsTo
    {
        return $this->belongsTo(Area::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function meterBoxes(): HasMany
    {
        return $this->hasMany(MeterBox::class);
    }

    public function subscribers(): HasMany
    {
        return $this->hasMany(Subscriber::class);
    }

    public function meterReadings(): HasMany
    {
        return $this->hasMany(MeterReading::class);
    }

    /**
     * Every line on the accounts of the branch's subscribers.
     */
    public function transactions(): HasManyThrough
    {
        return $this->hasManyThrough(SubscriberTransaction::class, Subscriber::class);
    }

    /**
     * Why the branch can't be deleted yet — what still uses it — or null
     * when it can.
     */
    public function deletionBlocker(): ?string
    {
        return DeletionBlocker::describe('الفرع', [
            'المشتركون' => $this->subscribers()->count(),
            'المستخدمون' => $this->users()->count(),
            'الطبلونات' => $this->meterBoxes()->count(),
            'القراءات' => $this->meterReadings()->count(),
        ]);
    }
}
