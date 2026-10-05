<?php

namespace App\Models;

use App\Support\DeletionBlocker;
use Database\Factories\TariffSegmentFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A customer segment, such as mosques or schools. It only groups
 * subscribers: any subscriber on any tariff can be given any segment, and
 * they still pay their tariff's rate.
 */
#[Fillable(['name'])]
class TariffSegment extends Model
{
    /** @use HasFactory<TariffSegmentFactory> */
    use HasFactory;

    public function subscribers(): HasMany
    {
        return $this->hasMany(Subscriber::class);
    }

    /**
     * The segment as shown to people.
     */
    public function label(): string
    {
        return $this->name;
    }

    /**
     * Why the customer segment can't be deleted yet — what still uses it — or null
     * when it can.
     */
    public function deletionBlocker(): ?string
    {
        return DeletionBlocker::describe('التصنيف', ['المشتركون' => $this->subscribers()->count()]);
    }
}
