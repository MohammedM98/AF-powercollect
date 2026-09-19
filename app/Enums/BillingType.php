<?php

namespace App\Enums;

enum BillingType: string
{
    case Ampere = 'ampere';
    case Meter = 'meter';

    public function label(): string
    {
        return match ($this) {
            self::Ampere => 'Ampere-based',
            self::Meter => 'Meter-based',
        };
    }
}
