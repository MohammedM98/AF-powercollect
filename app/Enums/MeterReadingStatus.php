<?php

namespace App\Enums;

enum MeterReadingStatus: string
{
    case Pending = 'pending';
    case Approved = 'approved';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Pending Review',
            self::Approved => 'Approved',
        };
    }
}
