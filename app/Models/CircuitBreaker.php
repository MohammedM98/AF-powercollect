<?php

namespace App\Models;

use App\Enums\MeterReadingStatus;
use Database\Factories\CircuitBreakerFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['ampere', 'minimum_payment'])]
class CircuitBreaker extends Model
{
    /** @use HasFactory<CircuitBreakerFactory> */
    use HasFactory;

    protected static function booted(): void
    {
        // Readings not yet approved follow the new minimum payment.
        static::updated(function (CircuitBreaker $circuitBreaker): void {
            if ($circuitBreaker->wasChanged('minimum_payment')) {
                $circuitBreaker->subscribers()
                    ->whereHas('meterReadings', fn ($reading) => $reading->where('status', MeterReadingStatus::Pending))
                    ->each(fn (Subscriber $subscriber) => MeterReading::repricePendingFor($subscriber));
            }
        });
    }

    protected function casts(): array
    {
        return ['minimum_payment' => 'decimal:2'];
    }

    public function subscribers(): HasMany
    {
        return $this->hasMany(Subscriber::class);
    }
}
