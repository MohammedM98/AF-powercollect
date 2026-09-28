<?php

namespace App\Models;

use App\Enums\TariffCategory;
use App\Support\DeletionBlocker;
use Database\Factories\TariffFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['category', 'rate'])]
class Tariff extends Model
{
    /** @use HasFactory<TariffFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return [
            'category' => TariffCategory::class,
            'rate' => 'decimal:2',
        ];
    }

    public function subscribers(): HasMany
    {
        return $this->hasMany(Subscriber::class);
    }

    /**
     * Its customer segments (e.g. mosques, schools), which share its rate.
     */
    public function segments(): HasMany
    {
        return $this->hasMany(TariffSegment::class)->orderBy('name');
    }

    /**
     * Why the tariff can't be deleted yet — what still uses it — or null
     * when it can.
     */
    public function deletionBlocker(): ?string
    {
        return DeletionBlocker::describe('التعرفة', [
            'المشتركون' => $this->subscribers()->count(),
            'تصنيفات الزبائن' => $this->segments()->count(),
        ]);
    }
}
