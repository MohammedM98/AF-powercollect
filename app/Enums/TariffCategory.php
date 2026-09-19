<?php

namespace App\Enums;

enum TariffCategory: string
{
    case Home = 'home';
    case Business = 'business';

    public function label(): string
    {
        return match ($this) {
            self::Home => 'Home',
            self::Business => 'Business',
        };
    }
}
