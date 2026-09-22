<?php

namespace App\Enums;

enum TariffCategory: string
{
    case Residential = 'residential';
    case Commercial = 'commercial';

    public function label(): string
    {
        return match ($this) {
            self::Residential => 'Residential',
            self::Commercial => 'Commercial',
        };
    }
}
