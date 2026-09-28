<?php

namespace App\Models;

use App\Support\DeletionBlocker;
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

    protected function casts(): array
    {
        return ['minimum_payment' => 'decimal:2'];
    }

    public function subscribers(): HasMany
    {
        return $this->hasMany(Subscriber::class);
    }

    /**
     * Why the circuit breaker can't be deleted yet — what still uses it — or null
     * when it can.
     */
    public function deletionBlocker(): ?string
    {
        return DeletionBlocker::describe('القاطع', ['المشتركون' => $this->subscribers()->count()]);
    }
}
