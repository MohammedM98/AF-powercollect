<?php

namespace App\Enums;

enum SubscriberStatus: string
{
    case Active = 'active';
    case Suspended = 'suspended';
    case Disconnected = 'disconnected';

    public function label(): string
    {
        return match ($this) {
            self::Active => 'Active',
            self::Suspended => 'Suspended',
            self::Disconnected => 'Disconnected',
        };
    }
}
