<?php

namespace App\Models;

use App\Enums\DiscountMethod;
use Database\Factories\StandingDiscountFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A subscriber's standing discount (خصم دائم): an advantage taken off every
 * weekly reading recorded while it lasts — a percentage of the reading,
 * free kilowatts of its consumption, or shekels off the kilo price. Each
 * reading keeps the discount it was recorded with.
 */
#[Fillable(['subscriber_id', 'method', 'value', 'notes', 'granted_by'])]
class StandingDiscount extends Model
{
    /** @use HasFactory<StandingDiscountFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return [
            'method' => DiscountMethod::class,
            'value' => 'decimal:2',
        ];
    }

    /**
     * How a standing discount reads on a weekly reading: "10%", "3 كيلو"
     * or "5 شيكل من سعر الكيلو".
     */
    public static function termsFor(DiscountMethod $method, float|string $value): string
    {
        $value = SubscriberTransaction::formatAmount($value);

        return match ($method) {
            DiscountMethod::Percentage => $value.'%',
            DiscountMethod::Kilowatt => $value.' كيلو',
            DiscountMethod::Shekel => $value.' شيكل من سعر الكيلو',
        };
    }

    public function terms(): string
    {
        return self::termsFor($this->method, $this->value);
    }

    public function subscriber(): BelongsTo
    {
        return $this->belongsTo(Subscriber::class);
    }

    public function grantedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'granted_by');
    }
}
