<?php

namespace App\Models;

use App\Enums\MeterReadingStatus;
use App\Enums\TariffCategory;
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

    protected static function booted(): void
    {
        // Readings not yet approved follow the new kilo price.
        static::updated(function (Tariff $tariff): void {
            if ($tariff->wasChanged('rate')) {
                $tariff->subscribers()
                    ->whereHas('meterReadings', fn ($reading) => $reading->where('status', MeterReadingStatus::Pending))
                    ->each(fn (Subscriber $subscriber) => MeterReading::repricePendingFor($subscriber));
            }
        });
    }

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
}
