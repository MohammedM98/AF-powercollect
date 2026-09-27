<?php

namespace App\Enums;

use App\Enums\Concerns\HasOptions;

/**
 * A charge (تحميل) recorded by hand on a subscriber's account. Weekly
 * readings and the subscription fee are charged on their own.
 */
enum ChargeType: string
{
    use HasOptions;

    case Settlement = 'settlement';
    case Penalty = 'penalty';
    case DisconnectionFee = 'disconnection_fee';

    public function label(): string
    {
        return match ($this) {
            self::Settlement => 'Settlement',
            self::Penalty => 'Financial Penalty',
            self::DisconnectionFee => 'Service Disconnection Fee',
        };
    }
}
