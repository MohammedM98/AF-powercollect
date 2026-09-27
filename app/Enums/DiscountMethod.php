<?php

namespace App\Enums;

use App\Enums\Concerns\HasOptions;

/**
 * How a discount (خصم) on a subscriber's account is given.
 */
enum DiscountMethod: string
{
    use HasOptions;

    /** A percentage of what the subscriber owes. */
    case Percentage = 'percentage';

    /** Kilowatts at the subscriber's kilo price. */
    case Kilowatt = 'kilowatt';

    /** A fixed amount in shekels. */
    case Shekel = 'shekel';

    public function label(): string
    {
        return match ($this) {
            self::Percentage => 'Percentage',
            self::Kilowatt => 'Kilowatts',
            self::Shekel => 'Shekels',
        };
    }
}
